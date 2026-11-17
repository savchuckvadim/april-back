import type { DatedLiteRow } from '../dated-lite-row';
import { assembleQualityFacts } from '../quality-facts.assembler';
import type { WorkCalendar } from '../workdays.util';
import {
    buildManagerDigestCard,
    DigestCardSettings,
} from './period-digest.card';
import { DIGEST_PERIOD_KIND } from './period-digest.codes';
import { buildDigestMetrics, digestQualityRows } from './period-digest.metrics';
import { DigestMember, digestPeerViewsOf } from './period-digest.standings';
import { DIGEST_ANCHOR_MIN_N } from './period-digest.thresholds';
import type {
    DigestMetrics,
    DigestPeriod,
    ManagerDigestCard,
} from './period-digest.types';

/**
 * КАРТОЧКИ ВЫПУСКА: все менеджеры портала за период одним проходом —
 * метрики каждого → сравнение с отделом (`digestPeerViewsOf`, ДО сборки
 * карточек: без него положение «ниже середины», модуль шага с датой и
 * запасной модуль худшего раздела молча промолчали бы) → карточки с
 * переносом рекомендаций прошлой карточки того же вида и шагами недели к
 * целям месяца. Чистая функция: звонки, структуру и прошлые карточки
 * приносит приложение.
 */

export interface DigestBatchManager {
    readonly id: string;
    readonly name: string;
    readonly departmentId: number | null;
    readonly departmentName: string | null;
}

/** Периоды выпуска: свой, прошлый того же вида и тот же месяц год назад. */
export interface DigestBatchPeriods {
    readonly current: DigestPeriod;
    readonly previous: DigestPeriod;
    /** Только месяц; у недели — null. */
    readonly yearAgo: DigestPeriod | null;
}

/** Записанные звонки всех менеджеров по периодам. */
export interface DigestBatchRows {
    readonly current: readonly DatedLiteRow[];
    readonly previous: readonly DatedLiteRow[];
    readonly yearAgo: readonly DatedLiteRow[];
}

export interface DigestBatchInput {
    readonly periods: DigestBatchPeriods;
    readonly managers: readonly DigestBatchManager[];
    readonly rows: DigestBatchRows;
    /** Карточки прошлого периода того же вида по менеджеру. */
    readonly previousCards: ReadonlyMap<string, ManagerDigestCard>;
    /** Только неделя: карточки последнего закрытого месяца; null — их нет. */
    readonly monthCards: ReadonlyMap<string, ManagerDigestCard> | null;
    readonly settings: DigestCardSettings;
    /** Календарь AI-аналитики портала: пояс, рабочие дни, праздники. */
    readonly calendar: WorkCalendar;
}

const byManager = (
    rows: readonly DatedLiteRow[],
): Map<string, DatedLiteRow[]> => {
    const grouped = new Map<string, DatedLiteRow[]>();
    for (const row of rows) {
        if (row.managerId === null) continue;
        const list = grouped.get(row.managerId) ?? [];
        list.push(row);
        grouped.set(row.managerId, list);
    }
    return grouped;
};

/** Карточки всех менеджеров выпуска в порядке списка менеджеров. */
export function buildPeriodDigestCards(
    input: DigestBatchInput,
): ManagerDigestCard[] {
    const { periods, settings } = input;
    const kind = periods.current.kind;
    const minN = DIGEST_ANCHOR_MIN_N[kind];
    const metricsOf = (
        rows: readonly DatedLiteRow[],
        period: DigestPeriod,
    ): DigestMetrics =>
        buildDigestMetrics({
            rows,
            period,
            calendar: input.calendar,
            minDurationByType: settings.minDurationByType,
            minN,
            lowScoreCallMax: settings.thresholds.lowScoreCallMax,
        });
    const current = byManager(input.rows.current);
    const previous = byManager(input.rows.previous);
    const yearAgo = byManager(input.rows.yearAgo);

    const members: DigestMember[] = input.managers.map(manager => {
        const rows = current.get(manager.id) ?? [];
        return {
            managerId: manager.id,
            departmentId: manager.departmentId,
            metrics: metricsOf(rows, periods.current),
            quality: assembleQualityFacts(
                digestQualityRows(rows, settings.minDurationByType),
                settings.thresholds,
            ),
        };
    });
    const peers = digestPeerViewsOf(members, { minN, shift: settings.shift });

    return input.managers.map((manager, index) => {
        const previousRows = previous.get(manager.id) ?? [];
        const previousCard = input.previousCards.get(manager.id) ?? null;
        const hasPrevious = previousRows.length > 0 || previousCard !== null;
        return buildManagerDigestCard({
            period: periods.current,
            manager,
            rows: current.get(manager.id) ?? [],
            metrics: members[index].metrics,
            peers: peers.get(manager.id) ?? null,
            settings,
            previous: hasPrevious
                ? {
                      periodKey: periods.previous.key,
                      metrics: metricsOf(previousRows, periods.previous),
                      recommendations: previousCard?.recommendations ?? [],
                  }
                : null,
            yearAgo:
                periods.yearAgo === null
                    ? null
                    : {
                          periodKey: periods.yearAgo.key,
                          metrics: metricsOf(
                              yearAgo.get(manager.id) ?? [],
                              periods.yearAgo,
                          ),
                      },
            ...(kind === DIGEST_PERIOD_KIND.week
                ? {
                      month:
                          input.monthCards?.get(manager.id)?.recommendations ??
                          null,
                  }
                : {}),
        });
    });
}
