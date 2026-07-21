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

export interface CallReportScanOptions {
    /** Минимальная длительность звонка, сек (default env CALL_REPORT_MIN_DURATION_SEC | 300). */
    minDurationSec?: number;
    /** Окно поиска назад, часов (default env CALL_REPORT_WINDOW_HOURS | 25). */
    windowHours?: number;
    /** Максимум звонков в очередь за один скан (default env CALL_REPORT_MAX_PER_RUN | 10). */
    maxPerRun?: number;
}

export interface CallReportScanResult {
    domain: string;
    found: number;
    alreadyProcessed: number;
    skippedNonDeal: number;
    skippedNoAudio: number;
    skippedNotSales: number;
    enqueued: number;
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
    private async getSalesUserIds(domain: string): Promise<Set<number> | null> {
        if (this.configService.get<string>('CALL_REPORT_SALES_ONLY') === '0') {
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

    async execute(
        domain: string,
        options?: CallReportScanOptions,
    ): Promise<CallReportScanResult> {
        const minDurationSec =
            options?.minDurationSec ??
            this.envNumber('CALL_REPORT_MIN_DURATION_SEC', 300);
        const windowHours =
            options?.windowHours ??
            this.envNumber('CALL_REPORT_WINDOW_HOURS', 25);
        const maxPerRun =
            options?.maxPerRun ?? this.envNumber('CALL_REPORT_MAX_PER_RUN', 10);
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

        const rows = await voximplant.findRecentCalls({
            sinceIso,
            minDurationSec,
        });

        const result: CallReportScanResult = {
            domain,
            found: rows.length,
            alreadyProcessed: 0,
            skippedNonDeal: 0,
            skippedNoAudio: 0,
            skippedNotSales: 0,
            enqueued: 0,
        };

        // Анализируем только реальных менеджеров отдела продаж.
        const salesUserIds = await this.getSalesUserIds(domain);
        const salesRows = salesUserIds
            ? rows.filter(row => {
                  const isSales = salesUserIds.has(Number(row.PORTAL_USER_ID));
                  if (!isSales) result.skippedNotSales++;
                  return isSales;
              })
            : rows;

        const candidates = salesRows.filter(row => row.CRM_ACTIVITY_ID);
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
            if (
                Number(activity.OWNER_TYPE_ID) !==
                Number(BitrixOwnerTypeId.DEAL)
            ) {
                result.skippedNonDeal++;
                continue;
            }
            if (!activity.FILES?.length) {
                result.skippedNoAudio++;
                continue;
            }

            const payload: CallReportJobPayload = {
                domain,
                activityId,
                dealId: Number(activity.OWNER_ID),
                callId: row.CALL_ID,
                callStartedAtIso: row.CALL_START_DATE,
                durationSec: row.CALL_DURATION
                    ? Number(row.CALL_DURATION)
                    : undefined,
            };

            await this.queueDispatcher.dispatch(
                QueueNames.CALL_REPORT,
                JobNames.CALL_REPORT_ANALYZE,
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
            result.enqueued++;
        }

        this.logger.log(
            `Скан ${domain}: найдено ${result.found}, в очередь ${result.enqueued}, ` +
                `уже обработано ${result.alreadyProcessed}, не сделки ${result.skippedNonDeal}, ` +
                `без аудио ${result.skippedNoAudio}, не менеджеры ОП ${result.skippedNotSales}`,
        );
        return result;
    }

    private envNumber(key: string, fallback: number): number {
        const raw = this.configService.get<string>(key);
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    }
}
