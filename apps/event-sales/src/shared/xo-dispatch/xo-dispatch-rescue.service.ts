import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import { PBXService } from '@/modules/pbx';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { ETimeZone } from '@lib/shared/lib/date';
import { ColdHookSilinceEndpointV2Service } from '../../cold-hook-v2/services/silence/cold-hook-silince-endpoint.service';
import {
    EnumColdCallEntityType,
    EnumColdCallForce,
    EnumColdCallIsTmc,
} from '../../cold-hook-v2/dto/cold.dto';
import { resolveColdCallData } from '../../cold-hook-v2/lib/cold-call-intent';
import {
    XoRescueCandidateReader,
    XoRescueEntityType,
    XoRescueRow,
} from './xo-rescue-candidate.reader';
import {
    decideXoRescue,
    XO_RESCUE_REASON_TEXT,
    XoRescueReason,
    XoRescueThresholds,
} from './xo-rescue.decision';
import { XoDispatchMarkerModel } from './xo-dispatch-marker.model';
import { PortalWorkingHoursService } from '../working-hours/portal-working-hours.service';
import { workingHoursAgo } from '../working-hours/working-hours.model';

/** Настройки прогона (из админки, на домен). */
export interface XoRescueOptions {
    /** Максимум элементов за тик — защита от лавины после простоя. */
    maxPerRun: number;
    /** Через сколько минут «взятый в очередь» считается недоехавшим. */
    resendAfterMinutes: number;
    /** Включён ли ВТОРОЙ способ поиска — по дате звонка. */
    orphanEnabled: boolean;
    /** Глубина окна поиска по дате звонка, часов. */
    orphanLookbackHours: number;
    /**
     * Режим «холостого хода» для второго способа: кандидатов находим и
     * пишем в лог, но НЕ досылаем. Нужен, чтобы посмотреть на реальных
     * данных, кого бы он забрал, прежде чем включать по-настоящему.
     */
    orphanDryRun: boolean;
    /**
     * Отсчитывать окно по рабочему календарю портала, а не по календарным
     * часам: выходные и праздники его не «съедают».
     */
    orphanWorkingDays: boolean;
}

export interface XoRescueRunResult {
    /** Досланных по метке робота. */
    byMarker: number;
    /** Досланных по дате звонка. */
    byPlanDate: number;
    /** Найденных вторым способом в режиме холостого хода. */
    orphanDryRun: number;
    /** Пропущено с разбивкой по причине — чтобы лог объяснял сам себя. */
    skipped: Partial<Record<XoRescueReason, number>>;
    warnings: string[];
}

/** Пустой результат — он же основа для накопления. */
const emptyResult = (): XoRescueRunResult => ({
    byMarker: 0,
    byPlanDate: 0,
    orphanDryRun: 0,
    skipped: {},
    warnings: [],
});

/**
 * Подстраховка холодного обзвона по КОМПАНИЯМ и СДЕЛКАМ.
 *
 * Зачем: хук «холодный звонок» может упасть (сеть, рестарт, ошибка
 * портала), и тогда клиент остаётся без работы молча — ни сделки, ни
 * задачи, ни следа в логах бизнеса. У лидов эту дыру закрывает очередь ХО
 * (стадия лида видна глазами), у компаний и сделок стадии-очереди нет.
 *
 * Два независимых способа найти потерянное — подробности в
 * {@link decideXoRescue}; здесь только оркестрация: прочитать кандидатов,
 * спросить решение, дослать хук, отметить отправку.
 *
 * @Injectable, но инстанс Битрикса в поля НЕ кладём — только PBXService
 * (CLAUDE.md: иначе race condition между порталами).
 */
@Injectable()
export class XoDispatchRescueService {
    private readonly logger = new Logger(XoDispatchRescueService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly coldHook: ColdHookSilinceEndpointV2Service,
        private readonly workingHours: PortalWorkingHoursService,
    ) {}

    async runForDomain(
        domain: string,
        options: XoRescueOptions,
    ): Promise<XoRescueRunResult> {
        const result = emptyResult();
        const { bitrix, PortalModel: portal } = await this.pbx.init(domain);
        const timezone = portal.getTimezone();
        const thresholds = await this.thresholds(domain, timezone, options);

        // Бюджет ОБЩИЙ на компании и сделки: лимит из админки означает
        // «столько звонков за тик», а не «столько на каждую сущность».
        let budget = Math.max(1, options.maxPerRun);

        for (const entityType of ['company', 'deal'] as XoRescueEntityType[]) {
            if (budget <= 0) break;
            budget -= await this.runEntity(
                domain,
                bitrix,
                portal,
                timezone,
                entityType,
                thresholds,
                options,
                budget,
                result,
            );
        }

        this.logger.log(
            `[xo-rescue] ${domain}: по метке ${result.byMarker}, ` +
                `по дате ${result.byPlanDate}, холостой ход ` +
                `${result.orphanDryRun}, пропущено ${this.describeSkipped(result)}`,
        );
        return result;
    }

    /** Один тип сущности; возвращает, сколько бюджета израсходовано. */
    private async runEntity(
        domain: string,
        bitrix: BitrixService,
        portal: PortalModel,
        timezone: ETimeZone,
        entityType: XoRescueEntityType,
        thresholds: XoRescueThresholds,
        options: XoRescueOptions,
        budget: number,
        result: XoRescueRunResult,
    ): Promise<number> {
        const reader = new XoRescueCandidateReader(
            bitrix,
            portal,
            entityType,
            timezone,
        );
        const missing = reader.missingMarkerFields();
        if (missing.length) {
            /*
             * Без маркер-полей первый способ слеп. Это конфигурация
             * портала, а не данные, поэтому предупреждение одно на проход,
             * а не строка на каждый элемент.
             */
            result.warnings.push(
                `Маркер-поля (${missing.join(', ')}) не установлены на ${entityType} — ` +
                    'подстраховка по метке пропущена, нужна установка полей',
            );
        }

        const rows = [
            ...(missing.length ? [] : await reader.byMarker(result.warnings)),
        ];
        if (options.orphanEnabled) {
            rows.push(
                ...(await reader.byPlanDate(
                    thresholds.orphanNotBefore,
                    thresholds.orphanNotAfter,
                    result.warnings,
                )),
            );
        }

        const markerModel = new XoDispatchMarkerModel(portal, entityType);
        let spent = 0;
        const seen = new Set<number>();

        for (const item of rows) {
            if (spent >= budget) {
                result.warnings.push(
                    `Лимит за прогон исчерпан — остаток ${entityType} дожмётся следующим тиком`,
                );
                break;
            }
            // Один элемент мог попасть в обе выборки — считаем один раз.
            if (!item.entityId || seen.has(item.entityId)) continue;
            seen.add(item.entityId);

            const verdict = decideXoRescue(item.candidate, thresholds);
            if (verdict.action === 'skip') {
                result.skipped[verdict.reason] =
                    (result.skipped[verdict.reason] ?? 0) + 1;
                continue;
            }

            if (verdict.reason === 'orphan-xo-date' && options.orphanDryRun) {
                result.orphanDryRun += 1;
                this.logger.log(
                    `[xo-rescue][холостой ход] ${domain} ${entityType} ` +
                        `${item.entityId}: ${XO_RESCUE_REASON_TEXT[verdict.reason]} — ` +
                        'досылка выключена настройкой',
                );
                continue;
            }

            spent += 1;
            const sent = await this.dispatch(
                domain,
                portal,
                entityType,
                item,
                result.warnings,
            );
            if (!sent) continue;

            await this.markSent(
                bitrix,
                markerModel,
                entityType,
                item.entityId,
                timezone,
                result.warnings,
            );
            if (verdict.reason === 'marker-stuck') result.byMarker += 1;
            else result.byPlanDate += 1;
        }
        return spent;
    }

    /**
     * Досылка хука. Данные события собираются ИЗ КАРТОЧКИ тем же резолвером,
     * что и у самого хука, — крон не изобретает свой способ их прочитать.
     */
    private async dispatch(
        domain: string,
        portal: PortalModel,
        entityType: XoRescueEntityType,
        item: XoRescueRow,
        warnings: string[],
    ): Promise<boolean> {
        const resolution = resolveColdCallData({
            hook: {
                entityType:
                    entityType === 'company'
                        ? EnumColdCallEntityType.COMPANY
                        : EnumColdCallEntityType.DEAL,
                entityId: String(item.entityId),
                // Крон не забирает клиента у другого сотрудника: решение
                // владельца 12.09.2026 — force=Y только у ручной отправки.
                force: EnumColdCallForce.N,
                isTmc: EnumColdCallIsTmc.N,
            },
            entityRow: item.row,
            entityType,
            portal,
        });

        if (!resolution.data) {
            warnings.push(
                `${entityType} ${item.entityId}: не хватает данных ` +
                    `(${resolution.missing.map(m => m.fieldCode).join(', ')}) — досылка пропущена`,
            );
            return false;
        }

        await this.coldHook.createColdCallHook(domain, resolution.data);
        return true;
    }

    /** Отметка «хук отправлен» — по ней следующий тик не тронет элемент. */
    private async markSent(
        bitrix: BitrixService,
        markers: XoDispatchMarkerModel,
        entityType: XoRescueEntityType,
        entityId: number,
        timezone: ETimeZone,
        warnings: string[],
    ): Promise<void> {
        const sentName = markers.fieldName('sentAt');
        if (!sentName) return;
        const stamp = dayjs().tz(timezone).format('DD.MM.YYYY HH:mm:ss');
        try {
            const fields = { [sentName]: stamp };
            if (entityType === 'company') {
                await bitrix.company.update(entityId, fields as never);
            } else {
                await bitrix.deal.update(entityId, fields as never);
            }
        } catch (error) {
            /*
             * Хук уже ушёл, а отметку записать не вышло: следующий тик
             * увидит элемент снова и дошлёт повторно. Дубль звонка хуже
             * тишины, поэтому случай обязан быть заметным.
             */
            warnings.push(
                `${entityType} ${entityId}: хук отправлен, но отметка не записана ` +
                    `(${(error as Error).message}) — возможен повторный звонок`,
            );
        }
    }

    private async thresholds(
        domain: string,
        timezone: ETimeZone,
        options: XoRescueOptions,
    ): Promise<XoRescueThresholds> {
        const now = dayjs().tz(timezone);
        const lookback = Math.max(1, options.orphanLookbackHours);

        /*
         * Нижняя граница окна: по календарным часам либо по рабочим дням.
         * Второй режим нужен там, где звонок с вечера пятницы иначе
         * выпадает из окна к утру вторника.
         */
        let orphanNotBefore = now.subtract(lookback, 'hour');
        if (options.orphanWorkingDays) {
            const { hours } = await this.workingHours.resolve(domain);
            orphanNotBefore = dayjs(
                workingHoursAgo(hours, now.toDate(), lookback, timezone),
            ).tz(timezone);
        }

        return {
            now,
            resendBefore: now.subtract(
                Math.max(1, options.resendAfterMinutes),
                'minute',
            ),
            orphanNotBefore,
            // Верхняя граница жёсткая: час на то, чтобы хук доработал сам.
            orphanNotAfter: now.subtract(1, 'hour'),
        };
    }

    private describeSkipped(result: XoRescueRunResult): string {
        const parts = Object.entries(result.skipped).map(
            ([reason, count]) =>
                `${XO_RESCUE_REASON_TEXT[reason as XoRescueReason]} — ${count}`,
        );
        return parts.length ? parts.join('; ') : 'нет';
    }
}
