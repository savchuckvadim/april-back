import { CALL_REPORT_SECTION_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import { comparableFromVersions } from '../../contracts/versions.types';
import { compareCallTypes } from '../buckets';
import type { DatedLiteRow } from '../dated-lite-row';
import { isBelowMinDuration } from '../manager-type-matrix';
import { silentWorkdays } from '../owner-report/owner-report.overview';
import type { MinDurationSecByType } from '../pulse-duration';
import { sectionMeansOf } from '../quality-facts.assembler';
import {
    isWorkday,
    shiftDate,
    toPortalDate,
    type WorkCalendar,
} from '../workdays.util';
import {
    DigestMeasureContext,
    hasDatedNextStep,
    digestMean,
    measureDigestAnchor,
    digestShare,
} from './period-digest.anchors';
import {
    DIGEST_ANCHOR_METRIC,
    DIGEST_READINESS,
    DigestReadiness,
} from './period-digest.codes';
import type {
    DigestMethodologyMetrics,
    DigestMetrics,
    DigestPeriod,
    DigestSectionStat,
    DigestTypeCount,
} from './period-digest.types';

/**
 * МЕТРИКИ МЕНЕДЖЕРА за период по lite-строкам его звонков (call-lib
 * loadLite, без Битрикса): объём и дисциплина, качество и разделы,
 * доработка, методика, «молчание» и серия версий разбора. Чистые функции.
 */

export interface DigestMetricsInput extends DigestMeasureContext {
    /** Все записанные звонки менеджера за период (короткие и без разбора тоже). */
    readonly rows: readonly DatedLiteRow[];
    readonly period: Pick<DigestPeriod, 'from' | 'to'>;
    /** Календарь портала (таймзона — в нём). */
    readonly calendar: WorkCalendar;
    /** Пороги длительности по типам: короче — вне слоя качества. */
    readonly minDurationByType: MinDurationSecByType;
    /** Минимум оценок раздела для худшего и лучшего раздела. */
    readonly minN: number;
}

/** Звонки слоя качества: разбор есть и звонок не короче порога своего типа. */
export const digestQualityRows = (
    rows: readonly DatedLiteRow[],
    minDurationByType: MinDurationSecByType,
): DatedLiteRow[] =>
    rows.filter(
        row =>
            row.analysisPresent && !isBelowMinDuration(row, minDurationByType),
    );

const SECTION_ORDER: readonly string[] = CALL_REPORT_SECTION_CODES;

const sectionRank = (code: string): number => {
    const index = SECTION_ORDER.indexOf(code);
    return index < 0 ? SECTION_ORDER.length : index;
};

/** Коды разделов, встретившихся в звонках, в порядке рубрики. */
const sectionCodesOf = (rows: readonly DatedLiteRow[]): string[] =>
    [
        ...new Set(rows.flatMap(row => row.sections.map(item => item.section))),
    ].sort((a, b) => sectionRank(a) - sectionRank(b) || a.localeCompare(b));

function byTypeOf(rows: readonly DatedLiteRow[]): DigestTypeCount[] {
    const counts = new Map<string, number>();
    for (const row of rows) {
        if (row.callType === null) continue;
        counts.set(row.callType, (counts.get(row.callType) ?? 0) + 1);
    }
    return [...counts.entries()]
        .sort(([a], [b]) => compareCallTypes(a, b))
        .map(([callType, n]) => ({ callType, n }));
}

/** Худший и лучший раздел среди разделов с n не меньше минимума. */
function extremesOf(
    sections: readonly DigestSectionStat[],
    minN: number,
): { worst: string | null; best: string | null } {
    const counted = sections.filter(section => section.n >= minN);
    if (!counted.length) return { worst: null, best: null };
    const sorted = [...counted].sort(
        (a, b) =>
            a.mean - b.mean || sectionRank(a.section) - sectionRank(b.section),
    );
    const worst = sorted[0].section;
    const best = sorted[sorted.length - 1].section;
    return { worst, best: best === worst ? null : best };
}

function workdaysOf(
    period: Pick<DigestPeriod, 'from' | 'to'>,
    calendar: WorkCalendar,
): number {
    let count = 0;
    for (let day = period.from; day <= period.to; day = shiftDate(day, 1)) {
        if (isWorkday(day, calendar)) count += 1;
    }
    return count;
}

/** Факты методики; ни одного разбора с методикой — null (методика выключена). */
export function digestMethodologyOf(
    rows: readonly DatedLiteRow[],
): DigestMethodologyMetrics | null {
    if (!rows.some(row => row.methodology?.code)) return null;
    const checkpoints = new Map<string, { done: number; total: number }>();
    for (const row of rows) {
        const total = row.methodology?.checkpointsTotal ?? null;
        const done = row.methodology?.checkpointsDone ?? null;
        if (row.callType === null || total === null || done === null) continue;
        if (total <= 0) continue;
        const item = checkpoints.get(row.callType) ?? { done: 0, total: 0 };
        checkpoints.set(row.callType, {
            done: item.done + done,
            total: item.total + total,
        });
    }
    const spirals = rows.flatMap(row => {
        const full = row.methodology?.spiralsFull;
        const min = row.methodology?.spiralsMinFull;
        return typeof full === 'number' ? [{ row, full, min }] : [];
    });
    const latestMin = [...spirals]
        .filter(item => typeof item.min === 'number')
        .sort(
            (a, b) =>
                b.row.callStartedAt.getTime() - a.row.callStartedAt.getTime(),
        )[0]?.min;
    return {
        checkpoints: [...checkpoints.entries()]
            .sort(([a], [b]) => compareCallTypes(a, b))
            .map(([callType, item]) => ({ callType, ...item })),
        spiralsFullMean: measureDigestAnchor(
            { metric: DIGEST_ANCHOR_METRIC.spiralsFullMean },
            rows,
            { lowScoreCallMax: 0 },
        ),
        spiralsMinFull: typeof latestMin === 'number' ? latestMin : null,
        fullSpiralCalls: spirals.filter(
            item => typeof item.min === 'number' && item.full >= item.min,
        ).length,
        dealProgressMean: digestMean(
            rows.flatMap(row => {
                const progress = row.methodology?.dealProgress;
                return typeof progress === 'number' ? [progress] : [];
            }),
        ),
    };
}

/** Серия версий разбора периода: самая поздняя и смешаны ли серии. */
function seriesOf(rows: readonly DatedLiteRow[]): {
    seriesStart: string | null;
    seriesMixed: boolean;
} {
    const starts = new Set(
        rows
            .map(row =>
                row.versions ? comparableFromVersions(row.versions) : '',
            )
            .filter(start => start !== ''),
    );
    const sorted = [...starts].sort();
    return {
        seriesStart: sorted[sorted.length - 1] ?? null,
        seriesMixed: starts.size > 1,
    };
}

/** Метрики менеджера за период. */
export function buildDigestMetrics(input: DigestMetricsInput): DigestMetrics {
    const quality = digestQualityRows(input.rows, input.minDurationByType);
    const context: DigestMeasureContext = {
        lowScoreCallMax: input.lowScoreCallMax,
    };
    const sections: DigestSectionStat[] = sectionMeansOf(
        quality,
        sectionCodesOf(quality),
    ).map(item => ({ ...item, standing: null }));
    const { worst, best } = extremesOf(sections, input.minN);
    const activeDates = new Set(
        input.rows.map(row =>
            toPortalDate(row.callStartedAt, input.calendar.timeZone),
        ),
    );
    return {
        recorded: input.rows.length,
        analyzed: quality.length,
        byType: byTypeOf(quality),
        nextStepSet: digestShare(
            quality.filter(row => row.nextStep?.set === true).length,
            quality.length,
        ),
        nextStepDated: digestShare(
            quality.filter(hasDatedNextStep).length,
            quality.length,
        ),
        workdays: workdaysOf(input.period, input.calendar),
        silentWorkdays: silentWorkdays(
            input.period.from,
            input.period.to,
            { calendar: input.calendar },
            activeDates,
        ).length,
        score: measureDigestAnchor(
            { metric: DIGEST_ANCHOR_METRIC.scoreMean },
            quality,
            context,
        ),
        sections,
        worstSection: worst,
        bestSection: best,
        objectionUnhandled: measureDigestAnchor(
            { metric: DIGEST_ANCHOR_METRIC.objectionUnhandledShare },
            quality,
            context,
        ),
        followupStepNoDate: measureDigestAnchor(
            { metric: DIGEST_ANCHOR_METRIC.followupStepNoDateShare },
            quality,
            context,
        ),
        lowScoreShare: measureDigestAnchor(
            { metric: DIGEST_ANCHOR_METRIC.lowScoreShare },
            quality,
            context,
        ),
        methodology: digestMethodologyOf(quality),
        ...seriesOf(quality),
    };
}

/**
 * Хватает ли данных: записанных звонков нет — «нет звонков»; разобранных
 * меньше минимума — «мало данных» (числа есть, рекомендаций нет).
 */
export function digestReadinessOf(
    metrics: Pick<DigestMetrics, 'recorded' | 'analyzed'>,
    minCalls: number,
): DigestReadiness {
    if (metrics.recorded === 0) return DIGEST_READINESS.noCalls;
    return metrics.analyzed < minCalls
        ? DIGEST_READINESS.fewData
        : DIGEST_READINESS.ok;
}
