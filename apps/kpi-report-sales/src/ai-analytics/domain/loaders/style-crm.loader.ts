import { Injectable, Logger } from '@nestjs/common';
import { BxVoximplantStatisticService } from '@lib/bitrix/domain/telephony';
import {
    DEFAULT_WORK_CALENDAR,
    isWorkday,
    type WorkCalendar,
} from '@lib/sales-ai-analytics';
import { PBXService } from '@/modules/pbx';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import { buildReportUsersKey } from '../../../report';
import { normalizeReportPeriod } from '../../../shared/lib/date-util';
import {
    MonthSegment,
    splitIntoMonthSegments,
} from '../../../shared/lib/month-segments.util';
import { ManagersLoader } from './managers.loader';
import {
    buildStyleCrmMonthKey,
    styleCrmTtlSeconds,
    STYLE_CRM_MAX_ROWS,
} from './style-crm.cache';
import { buildMonthCounters, mergeManagerMonths } from './style-crm.calc';
import { StyleCrmLeadsService } from './style-crm.leads';
import { daysRange } from './style-crm.dates.util';
import { STYLE_CRM_THRESHOLDS } from './style-crm.units';
import type {
    StyleCrmLoadOptions,
    StyleCrmMonth,
    StyleCrmResult,
    StyleCrmThresholds,
} from './style-crm.types';

/** Кэшируемая часть сегмента (ряды единиц + агрегаты, без служебных полей). */
type CachedMonth = Omit<StyleCrmMonth, 'fromCache'>;

/**
 * Жёсткие счётчики стиля из телефонии и CRM (поток S4 документа
 * `ai/tasks/ai-analytics-manager-style.md`, §7.2 п. 1): попытки дозвона до
 * первого разговора, отказ от второй попытки, объёмы рабочего дня и их
 * избыточная дисперсия, соблюдение обещанных дат, скорость ответа на лид.
 *
 * Тяжёлый источник (`voximplant.statistic.get` + `crm.lead.list`), поэтому
 * по паттерну ai/rules/heavy-endpoint-queue.md: период режется на
 * календарные месяцы, закрытый месяц живёт в AppCache 30 дней и второй раз
 * в Битрикс не ходит, текущий сегмент буферизуется на минуты, forceRefresh
 * обходит чтение и перезаписывает кэш.
 *
 * `@Injectable` без bitrix-состояния: `PBXService.init(domain)` вызывается
 * ВНУТРИ метода и только при промахе кэша (правило про race condition).
 */
@Injectable()
export class StyleCrmLoader {
    private readonly logger = new Logger(StyleCrmLoader.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly cache: AiAnalyticsCacheService,
        private readonly managers: ManagersLoader,
    ) {}

    async load(
        domain: string,
        from: string,
        to: string,
        managerIds?: readonly (string | number)[],
        options: StyleCrmLoadOptions = {},
    ): Promise<StyleCrmResult> {
        const period = normalizeReportPeriod(from, to);
        const ids = await this.managers.resolve(domain, managerIds);
        const usersKey = buildReportUsersKey(ids);
        // Пороги единиц — определения документа и в ключ кэша не входят;
        // порог дисперсии портала влияет только на агрегат, а его склейка
        // окна пересчитывает из рядов с этими же порогами.
        const thresholds: StyleCrmThresholds = {
            ...STYLE_CRM_THRESHOLDS,
            ...(options.thresholds ?? {}),
        };
        const segments = splitIntoMonthSegments(
            period.fromIso,
            period.toIsoInclusive,
            options.now ?? new Date(),
        );
        const months: StyleCrmMonth[] = [];
        for (const segment of segments) {
            months.push(
                await this.loadMonth(domain, segment, ids, usersKey, {
                    ...options,
                    thresholds,
                }),
            );
        }
        return {
            from: period.fromIso,
            to: period.toIsoInclusive,
            managerIds: ids,
            months,
            managers: mergeManagerMonths(
                months.map(month => month.managers),
                thresholds,
            ),
            truncated: months.some(month => month.truncated),
        };
    }

    /** Сегмент из кэша либо расчёт по телефонии и лидам домена. */
    private async loadMonth(
        domain: string,
        segment: MonthSegment,
        ids: number[],
        usersKey: string,
        options: StyleCrmLoadOptions & { thresholds: StyleCrmThresholds },
    ): Promise<StyleCrmMonth> {
        const key = buildStyleCrmMonthKey(domain, segment, usersKey);
        const cached = options.forceRefresh
            ? null
            : await this.cache.getJson<CachedMonth>(key);
        if (cached) return { ...cached, fromCache: true };

        const computed = await this.computeMonth(domain, segment, ids, options);
        await this.store(key, computed, styleCrmTtlSeconds(segment));
        return { ...computed, fromCache: false };
    }

    private async computeMonth(
        domain: string,
        segment: MonthSegment,
        ids: number[],
        options: StyleCrmLoadOptions & { thresholds: StyleCrmThresholds },
    ): Promise<CachedMonth> {
        const calendar: WorkCalendar = {
            ...DEFAULT_WORK_CALENDAR,
            ...(options.calendar ?? {}),
        };
        const workdays = daysRange(segment.from, segment.to).filter(day =>
            isWorkday(day, calendar),
        );
        const { thresholds } = options;
        if (ids.length === 0) {
            return {
                month: segment.month,
                from: segment.from,
                to: segment.to,
                cacheable: segment.cacheable,
                truncated: false,
                managers: [],
            };
        }
        const { bitrix } = await this.pbx.init(domain);
        const statistic = await new BxVoximplantStatisticService(
            bitrix,
        ).getStatistic({
            fromIso: `${segment.from}T00:00:00`,
            toIso: `${segment.to}T23:59:59`,
            userIds: ids,
            maxRows: options.maxRows ?? STYLE_CRM_MAX_ROWS,
        });
        if (statistic.truncated) {
            this.logger.error(
                `Статистика телефонии ${domain} за ${segment.month} обрезана ` +
                    `(${statistic.rows.length} строк): счётчики стиля занижены`,
                { telegram: true },
            );
        }
        // Лиды — тем же инстансом битрикса, что и телефония: сервис
        // non-injectable и создаётся под домен (правило CLAUDE.md).
        const leads = await new StyleCrmLeadsService(bitrix).load(segment, ids);
        const promises = (options.promises ?? []).filter(
            promise =>
                promise.date >= segment.from && promise.date <= segment.to,
        );
        return {
            month: segment.month,
            from: segment.from,
            to: segment.to,
            cacheable: segment.cacheable,
            truncated: statistic.truncated,
            managers: buildMonthCounters(ids.map(String), statistic.rows, {
                workdays,
                leads,
                promises,
                thresholds,
            }),
        };
    }

    /** Write-through; ошибка кэша не роняет ответ — значение уже посчитано. */
    private async store(
        key: string,
        value: CachedMonth,
        ttlSeconds: number,
    ): Promise<void> {
        try {
            await this.cache.setJson(key, value, ttlSeconds);
        } catch (error) {
            this.logger.warn(
                `Кэш ${key} не записан: ${(error as Error).message}`,
            );
        }
    }
}
