import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PBXService } from '@lib/pbx/pbx.service';
import { BitrixOwnerTypeId } from '@lib/bitrix';
import {
    buildDedupKey,
    CallAnalysisBitrixService,
    TranscriptionStoreService,
} from '@lib/call-lib';
import { QueueDispatcherService } from '@lib/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import { JobNames } from '@lib/queue/constants/job-names.enum';
import { BxDepartmentService } from 'libs/bx-department/services/bx-department.service';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { VoximplantCallsService } from '../services/voximplant-calls.service';
import { CallReportJobPayload } from './call-report-pipeline.use-case';

/** app-метка строк конвейера (совпадает с pipeline use-case). */
const APP_NAME = 'call-report';

export interface CallReportScanOptions {
    /** Минимальная длительность звонка, сек (default env CALL_REPORT_MIN_DURATION_SEC | 300). */
    minDurationSec?: number;
    /** Окно поиска назад, часов (default env CALL_REPORT_WINDOW_HOURS | 25). */
    windowHours?: number;
    /** Максимум звонков в очередь за один скан (default env CALL_REPORT_MAX_PER_RUN | 10). */
    maxPerRun?: number;
    /**
     * ДЕМО-режим портала: анализировать только этих сотрудников (bitrix-id).
     * Источник — суффикс домена в CALL_REPORT_DOMAINS
     * (`domain:222|323`). Применяется ПОВЕРХ фильтра отдела продаж.
     */
    allowedUserIds?: number[];
    /**
     * Создавать базовый элемент смарта после анализа каждого звонка.
     * Флаг едет в payload джоба и исполняется процессором — так cron
     * доводит звонок до карточки в Битриксе, а не только до БД.
     */
    createSmartItem?: boolean;
    /**
     * Фильтр «только отдел продаж» из настроек портала (склейка портал →
     * env уже сделана CallReportSettingsService); без него — глобальный
     * env CALL_REPORT_SALES_ONLY.
     */
    salesOnly?: boolean;
    /**
     * Потолок строк выборки телефонии за проход. Дефолт — в
     * VoximplantCallsService; поднимать имеет смысл только для догона по
     * широкому окну без фильтра сотрудников.
     */
    maxRows?: number;
}

export interface CallReportScanResult {
    domain: string;
    found: number;
    alreadyProcessed: number;
    skippedNonDeal: number;
    skippedNoAudio: number;
    skippedNotSales: number;
    /** Отсеяно демо-фильтром сотрудников (allowedUserIds). */
    skippedNotDemo?: number;
    enqueued: number;
    /**
     * Выборка телефонии оказалась неполной (упёрлись в лимит строк или
     * Битрикс не отдал страницу) — часть звонков этот проход НЕ УВИДЕЛ.
     */
    truncated?: boolean;
    /** Сколько звонков всего по фильтру у Битрикса; null — не сообщил. */
    totalByFilter?: number | null;
}

/**
 * Скан домена: свежие длинные звонки из voximplant.statistic.get →
 * дедуп по transcriptions.dedup_key → постановка задач в очередь CALL_REPORT.
 *
 * Приоритет бизнеса — длинные звонки (презентации): порог длительности
 * отсекает мелочь и защищает бюджет Yandex/Vibecode. В MVP анализируются
 * только звонки, чья активность принадлежит СДЕЛКЕ (lead/contact — skip).
 */
@Injectable()
export class CallReportScanUseCase {
    private readonly logger = new Logger(CallReportScanUseCase.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly queueDispatcher: QueueDispatcherService,
        private readonly configService: ConfigService,
        private readonly bxDepartmentService: BxDepartmentService,
    ) {}

    /**
     * Id активных менеджеров отдела продаж (bx-department, кэш Redis сутки).
     * null — фильтр недоступен/выключен: работаем без него (fail-open),
     * чтобы сбой department.get не останавливал пилот; факт пишется в лог.
     */
    private async getSalesUserIds(
        domain: string,
        salesOnlyOverride?: boolean,
    ): Promise<Set<number> | null> {
        // Дефолт кода: только отдел продаж; per-portal — из настроек админки.
        const salesOnly = salesOnlyOverride ?? true;
        if (!salesOnly) {
            return null;
        }
        try {
            const response = await this.bxDepartmentService.getFullDepartment(
                domain,
                EDepartamentGroup.sales,
            );
            const ids = new Set(
                (response.department.allUsers ?? [])
                    .map(user => Number(user.ID))
                    .filter(id => Number.isFinite(id) && id > 0),
            );
            if (!ids.size) {
                this.logger.warn(
                    `Отдел продаж на ${domain} пуст — фильтр менеджеров отключён`,
                );
                return null;
            }
            return ids;
        } catch (error) {
            this.logger.warn(
                `bx-department недоступен (${domain}): ${(error as Error).message} — сканирую без фильтра менеджеров`,
            );
            return null;
        }
    }

    /**
     * Кого просить у Битрикса: пересечение отдела продаж и белого списка
     * (оба фильтра — И). Ни одного не задано → undefined, забираем портал
     * целиком. Пустое пересечение — тоже undefined: сузить запрос нечем, а
     * отсев произойдёт в памяти (иначе фильтр «никого» вернул бы всё).
     */
    private buildRequestUserIds(
        salesUserIds: Set<number> | null,
        demoIds: Set<number> | null,
    ): number[] | undefined {
        if (salesUserIds && demoIds) {
            const both = [...demoIds].filter(id => salesUserIds.has(id));
            return both.length ? both : undefined;
        }
        if (demoIds) return [...demoIds];
        if (salesUserIds) return [...salesUserIds];
        return undefined;
    }

    async execute(
        domain: string,
        options?: CallReportScanOptions,
    ): Promise<CallReportScanResult> {
        // Дефолты кода: штатный вызов идёт из планировщика с настройками
        // портала (админка); env-слоя нет.
        const minDurationSec = options?.minDurationSec ?? 300;
        const windowHours = options?.windowHours ?? 25;
        const maxPerRun = options?.maxPerRun ?? 10;
        const jobTimeoutMs = this.envNumber(
            'CALL_REPORT_JOB_TIMEOUT_MS',
            45 * 60_000,
        );

        const sinceIso = new Date(
            Date.now() - windowHours * 60 * 60 * 1000,
        ).toISOString();

        const { bitrix } = await this.pbxService.init(domain);
        const voximplant = new VoximplantCallsService(bitrix);
        const bx = new CallAnalysisBitrixService(bitrix);

        // Состав фильтра по сотрудникам считается ДО выборки: он уходит в
        // ЗАПРОС Битрикса. Иначе потолок строк применяется ко всему порталу
        // и звонки нужных людей вытесняются чужими (прод-урок 23.08.2026).
        const salesUserIds = await this.getSalesUserIds(
            domain,
            options?.salesOnly,
        );
        const demoIds = options?.allowedUserIds?.length
            ? new Set(options.allowedUserIds)
            : null;
        const requestUserIds = this.buildRequestUserIds(salesUserIds, demoIds);

        const {
            rows,
            truncated,
            total: totalByFilter,
        } = await voximplant.findRecentCalls({
            sinceIso,
            minDurationSec,
            userIds: requestUserIds,
            maxRows: options?.maxRows,
        });

        const result: CallReportScanResult = {
            domain,
            found: rows.length,
            alreadyProcessed: 0,
            skippedNonDeal: 0,
            skippedNoAudio: 0,
            skippedNotSales: 0,
            enqueued: 0,
            truncated,
            totalByFilter,
        };
        const salesRows = salesUserIds
            ? rows.filter(row => {
                  const isSales = salesUserIds.has(Number(row.PORTAL_USER_ID));
                  if (!isSales) result.skippedNotSales++;
                  return isSales;
              })
            : rows;

        // Страховка в памяти: если портал проигнорировал фильтр в запросе
        // (или он не задан), отсев всё равно произойдёт здесь.
        const demoRows = demoIds
            ? salesRows.filter(row => {
                  const allowed = demoIds.has(Number(row.PORTAL_USER_ID));
                  if (!allowed) {
                      result.skippedNotDemo = (result.skippedNotDemo ?? 0) + 1;
                  }
                  return allowed;
              })
            : salesRows;
        if (demoIds) {
            this.logger.log(
                `Демо-режим ${domain}: сотрудники [${options?.allowedUserIds?.join(', ')}]`,
            );
        }

        const candidates = demoRows.filter(row => row.CRM_ACTIVITY_ID);
        const dedupKeys = candidates.map(row =>
            buildDedupKey(domain, String(row.CRM_ACTIVITY_ID)),
        );
        const busy =
            await this.transcriptionStore.filterBusyDedupKeys(dedupKeys);

        for (const row of candidates) {
            if (result.enqueued >= maxPerRun) break;

            const activityId = Number(row.CRM_ACTIVITY_ID);
            const dedupKey = buildDedupKey(domain, activityId);
            if (busy.has(dedupKey)) {
                result.alreadyProcessed++;
                continue;
            }

            const activity = await bx.getActivityById(activityId);
            if (!activity) {
                this.logger.warn(
                    `Активность ${activityId} не найдена (${domain}) — пропуск`,
                );
                continue;
            }
            // Активные продажи: звонки идут и по сделкам, и по ЛИДАМ (до
            // конвертации) — берём оба типа владельца; остальное — скип.
            const ownerTypeId = Number(activity.OWNER_TYPE_ID);
            const entityType =
                ownerTypeId === Number(BitrixOwnerTypeId.DEAL)
                    ? ('deal' as const)
                    : ownerTypeId === Number(BitrixOwnerTypeId.LEAD)
                      ? ('lead' as const)
                      : null;
            if (!entityType) {
                result.skippedNonDeal++;
                continue;
            }
            if (!activity.FILES?.length) {
                result.skippedNoAudio++;
                continue;
            }

            const callerUserId = Number(row.PORTAL_USER_ID);
            const payload: CallReportJobPayload = {
                domain,
                activityId,
                dealId: Number(activity.OWNER_ID),
                entityType,
                callId: row.CALL_ID,
                callStartedAtIso: row.CALL_START_DATE,
                durationSec: row.CALL_DURATION
                    ? Number(row.CALL_DURATION)
                    : undefined,
                // Кто звонил (из телефонии) — по нему же работал фильтр
                // сотрудников, поэтому и в отчётах должен стоять он.
                callerUserId:
                    Number.isFinite(callerUserId) && callerUserId > 0
                        ? callerUserId
                        : undefined,
                createSmartItem: options?.createSmartItem,
            };

            // БРОНЬ ДО ПОСТАНОВКИ: строка 'queued' делает звонок видимым
            // дедупу сразу. Без неё джоб, ждущий в очереди, невидим, и
            // следующий скан жёг слот прохода на no-op (Bull молча
            // игнорирует дубль jobId).
            const claimed = await this.transcriptionStore.claimQueued({
                dedupKey,
                domain,
                activityId: String(activityId),
                callId: row.CALL_ID,
                callStartedAt: row.CALL_START_DATE
                    ? new Date(row.CALL_START_DATE)
                    : undefined,
                entityType,
                entityId: String(activity.OWNER_ID),
                durationSec: payload.durationSec,
                userId:
                    payload.callerUserId !== undefined
                        ? String(payload.callerUserId)
                        : undefined,
                app: APP_NAME,
            });
            if (!claimed) {
                // Звонок забрал параллельный скан (или он уже обработан).
                result.alreadyProcessed++;
                continue;
            }

            // Стадия 1 конвейера; стадию ANALYZE поставит процессор
            // TRANSCRIBE после сохранения транскрипта.
            try {
                await this.queueDispatcher.dispatch(
                    QueueNames.CALL_REPORT,
                    JobNames.CALL_REPORT_TRANSCRIBE,
                    payload,
                    dedupKey,
                    {
                        attempts: 2,
                        backoff: { type: 'fixed', delay: 60_000 },
                        timeout: jobTimeoutMs,
                        removeOnComplete: true,
                        removeOnFail: true,
                    },
                );
            } catch (error) {
                // Бронь без джоба — тупик: снимаем сразу, чтобы звонок
                // подобрал следующий проход, а не реанимация через час.
                await this.transcriptionStore
                    .releaseQueued(dedupKey)
                    .catch(() => undefined);
                this.logger.warn(
                    `Звонок ${activityId} не поставлен в очередь (${domain}): ${(error as Error).message} — бронь снята`,
                );
                continue;
            }
            result.enqueued++;
        }

        // Сколько кандидатов не влезло в лимит прохода: они подберутся
        // следующим сканом, но только пока остаются внутри окна.
        const notEnqueued =
            candidates.length - result.enqueued - result.alreadyProcessed;
        this.logger.log(
            `Скан ${domain}: найдено ${result.found}, в очередь ${result.enqueued}, ` +
                `уже обработано ${result.alreadyProcessed}, не сделки ${result.skippedNonDeal}, ` +
                `без аудио ${result.skippedNoAudio}, не менеджеры ОП ${result.skippedNotSales}` +
                (result.skippedNotDemo
                    ? `, вне списка сотрудников ${result.skippedNotDemo}`
                    : '') +
                (notEnqueued > 0
                    ? `, не влезло в лимит прохода ${notEnqueued}`
                    : ''),
        );
        if (result.truncated) {
            this.logger.error(
                `Скан ${domain}: выборка телефонии НЕПОЛНАЯ — часть звонков не увидена ` +
                    `(см. предыдущую ошибку VoximplantCallsService)`,
                { telegram: true, domain },
            );
        }
        return result;
    }

    private envNumber(key: string, fallback: number): number {
        const raw = this.configService.get<string>(key);
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    }
}
