import { Injectable } from '@nestjs/common';
import {
    lastClosedRopPeriod,
    previousRopPeriod,
    ROP_PERIOD_KIND,
    RopPeriod,
    ropPeriodWindow,
    RopPeriodWindow,
    sameRopPeriodYearAgo,
} from '@lib/rop-reports';
import {
    buildPeriodDigestCards,
    DIGEST_PERIOD_KIND,
    type DigestPeriod,
    type DigestPeriodKind,
    type ManagerDigestCard,
} from '@lib/sales-ai-analytics';
import { ETimeZone } from '@lib/shared/lib/date';
import { digestManagersOf } from '../lib/period-digest-managers';
import {
    periodDigestReportOf,
    periodDigestTimezoneWarning,
} from '../lib/period-digest-summary';
import type {
    PeriodDigestOptions,
    PeriodDigestRunReport,
} from '../types/period-digest.types';
import { PeriodDigestCardStore } from './period-digest-card.store';
import { PeriodDigestSettingsService } from './period-digest-settings.service';
import { PeriodDigestSourceService } from './period-digest-source.service';

/** Всё, что нужно расчёту карточек одного периода портала. */
export interface PeriodDigestCardsInput {
    readonly domain: string;
    readonly period: RopPeriodWindow;
    readonly timezone: ETimeZone;
    readonly options: PeriodDigestOptions;
    readonly now: Date;
    /** Продлить замки прогона между долгими шагами. */
    heartbeat(): Promise<void>;
}

const DIGEST_KINDS: readonly string[] = Object.values(DIGEST_PERIOD_KIND);

const isDigestKind = (kind: string): kind is DigestPeriodKind =>
    DIGEST_KINDS.includes(kind);

const digestPeriodOf = (
    period: RopPeriod,
    kind: DigestPeriodKind,
): DigestPeriod => ({
    kind,
    key: period.key,
    from: period.from,
    to: period.to,
});

/**
 * Карточки итогов периода по всем менеджерам портала: звонки текущего и
 * прошлого периода одним окном (у месяца ещё тот же месяц год назад),
 * прошлые карточки того же вида и (у недели) карточки последнего
 * закрытого месяца — одним запросом по ключу, структура отделов продаж →
 * состав менеджеров → расчёт всех карточек разом (с проходом по отделу) →
 * снимки в ais. Битрикс для счёта не нужен, кроме снимка структуры; она не
 * прочиталась — прогон падает и повторяется, а не сохраняет неполный набор.
 *
 * `@Injectable` без bitrix-состояния.
 */
@Injectable()
export class PeriodDigestCardsService {
    constructor(
        private readonly settings: PeriodDigestSettingsService,
        private readonly source: PeriodDigestSourceService,
        private readonly store: PeriodDigestCardStore,
    ) {}

    async run(
        input: PeriodDigestCardsInput,
        warnings: string[],
    ): Promise<PeriodDigestRunReport> {
        const { domain, period, timezone, options } = input;
        const kind = period.kind;
        if (!isDigestKind(kind)) {
            throw new RangeError(
                `итоги периода считаются за неделю или месяц, а не за «${period.label}»`,
            );
        }
        const analytics = await this.settings.resolveAnalytics(domain);
        const timezoneWarning = periodDigestTimezoneWarning(
            timezone,
            analytics.calendar.timeZone,
        );
        if (timezoneWarning) warnings.push(timezoneWarning);
        const previous = ropPeriodWindow(previousRopPeriod(period), timezone);
        const yearAgoPeriod =
            kind === DIGEST_PERIOD_KIND.month
                ? sameRopPeriodYearAgo(period)
                : null;
        const rows = await this.source.rows(
            domain,
            previous.fromAt,
            period.toAt,
        );
        const startsAt = period.fromAt.getTime();
        const current = rows.filter(
            row => row.callStartedAt.getTime() >= startsAt,
        );
        const yearAgoRows = yearAgoPeriod
            ? await this.yearAgoRows(domain, yearAgoPeriod, timezone)
            : [];
        await input.heartbeat();

        const previousCards = await this.store.read(domain, kind, previous.key);
        const managers = digestManagersOf({
            departments: await this.source.salesDepartments(domain),
            callerIds: new Set(
                current.flatMap(row => (row.managerId ? [row.managerId] : [])),
            ),
            previousCards,
            excludeUserIds: options.excludeUserIds,
        });
        if (!managers.length) {
            warnings.push(
                'менеджеров нет: в отделах продаж никого, все исключены ' +
                    'настройкой или структура не прочитана',
            );
        }
        const cards = buildPeriodDigestCards({
            periods: {
                current: digestPeriodOf(period, kind),
                previous: digestPeriodOf(previous, kind),
                yearAgo: yearAgoPeriod
                    ? digestPeriodOf(yearAgoPeriod, kind)
                    : null,
            },
            managers,
            rows: {
                current,
                previous: rows.filter(
                    row => row.callStartedAt.getTime() < startsAt,
                ),
                yearAgo: yearAgoRows,
            },
            previousCards,
            monthCards: await this.monthCards(domain, kind, period),
            settings: {
                thresholds: analytics.thresholds,
                minDurationByType: analytics.minDurationByType,
                minCalls: options.analytics.minCalls,
                shift: options.analytics.shift,
            },
            calendar: analytics.calendar,
        });
        await input.heartbeat();
        const saved = await this.store.save(domain, cards, input.now);
        return periodDigestReportOf(cards, saved);
    }

    private async yearAgoRows(
        domain: string,
        period: RopPeriod,
        timezone: ETimeZone,
    ) {
        const window = ropPeriodWindow(period, timezone);
        return this.source.rows(domain, window.fromAt, window.toAt);
    }

    /** У недели — карточки последнего закрытого месяца (цели, к которым шаги). */
    private async monthCards(
        domain: string,
        kind: DigestPeriodKind,
        period: RopPeriod,
    ): Promise<ReadonlyMap<string, ManagerDigestCard> | null> {
        if (kind !== DIGEST_PERIOD_KIND.week) return null;
        const month = lastClosedRopPeriod(ROP_PERIOD_KIND.month, period.to);
        return this.store.read(domain, DIGEST_PERIOD_KIND.month, month.key);
    }
}
