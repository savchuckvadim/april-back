import type { AnalyticsLiteSection } from '@lib/call-lib/call-report-analytics/types/analytics-lite.types';
import { datedLiteRow } from '../../../__tests__/dated-lite-row.fixture';
import { ATTENTION_DEFAULT_RULES } from '../../attention.types';
import type { DatedLiteRow } from '../../dated-lite-row';
import { minDurationMapOf } from '../../manager-type-matrix';
import { assembleQualityFacts } from '../../quality-facts.assembler';
import { DEFAULT_WORK_CALENDAR } from '../../workdays.util';
import { defaultAttentionThresholds } from '../../../settings/attention-thresholds';
import type { DigestModule, DigestModuleContext } from '../modules';
import { buildDigestMetrics } from '../period-digest.metrics';
import { digestTargetOf } from '../period-digest.status';
import {
    DIGEST_ANCHOR_MIN_N,
    DIGEST_DEFAULT_SHIFT,
} from '../period-digest.thresholds';
import type { DigestPeriod, DigestPeriodKind } from '../period-digest.types';

/**
 * Контекст модуля рекомендаций по звонкам менеджера: октябрь 2026 (или
 * неделя 2026-W41), пороги «Внимания» по умолчанию (слабый раздел — не
 * выше 5, разрыв с отделом — 1, слабый звонок — не выше 4, доля на
 * доработке — от половины), сдвиг 0,5 / 0,10.
 */

export const THRESHOLDS = defaultAttentionThresholds();
export const MIN_DURATION = minDurationMapOf(60);

export const DIGEST_PERIODS: Readonly<Record<DigestPeriodKind, DigestPeriod>> =
    {
        month: {
            kind: 'month',
            key: '2026-10',
            from: '2026-10-01',
            to: '2026-10-31',
        },
        week: {
            kind: 'week',
            key: '2026-W41',
            from: '2026-10-05',
            to: '2026-10-11',
        },
    };

/** Звонок менеджера '10' 6 октября 2026 (вторник). */
export const digestCall = (
    id: string,
    callType: string,
    patch: Partial<DatedLiteRow> = {},
): DatedLiteRow =>
    datedLiteRow({
        transcriptionId: id,
        callType,
        callStartedAt: new Date('2026-10-06T08:00:00Z'),
        ...patch,
    });

/** Серия звонков одного типа: id `${prefix}1…`, поля — по номеру. */
export const digestCalls = (
    prefix: string,
    callType: string,
    count: number,
    patch: (index: number) => Partial<DatedLiteRow> = () => ({}),
): DatedLiteRow[] =>
    Array.from({ length: count }, (_, index) =>
        digestCall(`${prefix}${index + 1}`, callType, patch(index)),
    );

/** Раздел с фразой «как было». */
export const sectionAsWas = (
    section: string,
    score: number,
    asWas: string | null = null,
): AnalyticsLiteSection => ({
    section,
    relevance: 1,
    score,
    asWas,
    alternatives: [],
});

export function digestContextOf(
    rows: readonly DatedLiteRow[],
    patch: Partial<DigestModuleContext> = {},
    kind: DigestPeriodKind = 'month',
): DigestModuleContext {
    const minN = DIGEST_ANCHOR_MIN_N[kind];
    return {
        kind,
        rows,
        metrics: buildDigestMetrics({
            rows,
            period: DIGEST_PERIODS[kind],
            calendar: DEFAULT_WORK_CALENDAR,
            minDurationByType: MIN_DURATION,
            minN,
            lowScoreCallMax: THRESHOLDS.lowScoreCallMax,
        }),
        quality: assembleQualityFacts(rows, THRESHOLDS),
        rules: {
            ...ATTENTION_DEFAULT_RULES,
            ...THRESHOLDS,
            weakSectionMinN: minN,
        },
        benchmarks: [],
        standings: { score: null, nextStepDated: null },
        previous: null,
        minN,
        shift: DIGEST_DEFAULT_SHIFT,
        ...patch,
    };
}

/** Что выдал бы модуль: срабатывание, цель и текст по шаблону. */
export function runDigestModule(
    module: DigestModule,
    context: DigestModuleContext,
) {
    const detection = module.detect(context);
    if (!detection) return null;
    const target = digestTargetOf(detection.anchor, detection.baseline.value, {
        shift: context.shift,
        norm: detection.norm,
    });
    return {
        detection,
        target,
        text: module.template(detection, target, context),
    };
}

/** Текст для людей: без латиницы (кодов) и подчёркиваний. */
export const LATIN_OR_CODE = /[A-Za-z_]/;
