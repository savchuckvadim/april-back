import {
    ATTENTION_FOLLOWUP_CALL_TYPES,
    ATTENTION_PRESENTATION_CALL_TYPES,
} from '../attention.sections.util';
import { bucketOfCallType } from '../buckets';
import type { DatedLiteRow } from '../dated-lite-row';
import { sectionMeansOf } from '../quality-facts.assembler';
import { nonEmptyText } from '../sections.util';
import {
    DIGEST_ANCHOR_METRIC,
    DIGEST_DIRECTION,
    DIGEST_UNIT,
    DigestAnchorMetric,
    DigestDirection,
    DigestUnit,
} from './period-digest.codes';
import type { DigestAnchor, DigestValue } from './period-digest.types';

/**
 * РЕЕСТР МЕТРИК-ЯКОРЕЙ рекомендаций: единица (от неё порог сдвига),
 * направление к лучшему, звонки по умолчанию и как мерить по звонкам слоя
 * качества менеджера. Чистые функции; формулы — в описании постановки,
 * раздел «Метрики-якоря».
 */

/** Что нужно измерению помимо звонков. */
export interface DigestMeasureContext {
    /** Звонок слабый при оценке 1–10 не выше (реестр `low_score_call_max`). */
    readonly lowScoreCallMax: number;
}

export interface DigestAnchorDescriptor {
    readonly unit: DigestUnit;
    readonly direction: DigestDirection;
    /** Типы звонков, если якорь их не задал; нет — все звонки слоя качества. */
    readonly defaultCallTypes?: readonly string[];
    measure(
        rows: readonly DatedLiteRow[],
        anchor: DigestAnchor,
        context: DigestMeasureContext,
    ): DigestValue;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

const NO_DATA: DigestValue = { value: null, n: 0 };

/** Доля попаданий; знаменателя нет — значения нет. */
export const digestShare = (hits: number, n: number): DigestValue => ({
    value: n > 0 ? hits / n : null,
    n,
});

/** Среднее с одним знаком после запятой; значений нет — значения нет. */
export const digestMean = (values: readonly number[]): DigestValue => ({
    value: values.length
        ? round1(values.reduce((sum, value) => sum + value, 0) / values.length)
        : null,
    n: values.length,
});

/** Следующий шаг назначен и с датой. */
export const hasDatedNextStep = (row: DatedLiteRow): boolean =>
    row.nextStep?.set === true && nonEmptyText(row.nextStep.date) !== null;

/** Оценка 1–10 звонка с корзиной; типы вне корзин (прочее) — null. */
export const digestBucketScore = (row: DatedLiteRow): number | null =>
    row.score !== null && bucketOfCallType(row.callType) !== null
        ? row.score / 10
        : null;

const scores10 = (rows: readonly DatedLiteRow[]): number[] =>
    rows
        .map(digestBucketScore)
        .filter((score): score is number => score !== null);

const PRESENTATION_TYPES: readonly string[] = ATTENTION_PRESENTATION_CALL_TYPES;
const FOLLOWUP_TYPES: readonly string[] = ATTENTION_FOLLOWUP_CALL_TYPES;

export const DIGEST_ANCHORS: Readonly<
    Record<DigestAnchorMetric, DigestAnchorDescriptor>
> = {
    [DIGEST_ANCHOR_METRIC.sectionMean]: {
        unit: DIGEST_UNIT.score,
        direction: DIGEST_DIRECTION.up,
        measure: (rows, anchor) => {
            if (!anchor.section) return NO_DATA;
            const [mean] = sectionMeansOf(rows, [anchor.section]);
            return mean ? { value: mean.mean, n: mean.n } : NO_DATA;
        },
    },
    [DIGEST_ANCHOR_METRIC.scoreMean]: {
        unit: DIGEST_UNIT.score,
        direction: DIGEST_DIRECTION.up,
        measure: rows => digestMean(scores10(rows)),
    },
    [DIGEST_ANCHOR_METRIC.nextStepDatedShare]: {
        unit: DIGEST_UNIT.share,
        direction: DIGEST_DIRECTION.up,
        measure: rows =>
            digestShare(rows.filter(hasDatedNextStep).length, rows.length),
    },
    [DIGEST_ANCHOR_METRIC.nextStepSetShare]: {
        unit: DIGEST_UNIT.share,
        direction: DIGEST_DIRECTION.up,
        measure: rows =>
            digestShare(
                rows.filter(row => row.nextStep?.set === true).length,
                rows.length,
            ),
    },
    [DIGEST_ANCHOR_METRIC.objectionUnhandledShare]: {
        unit: DIGEST_UNIT.share,
        direction: DIGEST_DIRECTION.down,
        defaultCallTypes: FOLLOWUP_TYPES,
        measure: rows => {
            const known = rows.flatMap(row =>
                row.objections.filter(objection => objection.handled !== null),
            );
            return digestShare(
                known.filter(objection => objection.handled === false).length,
                known.length,
            );
        },
    },
    [DIGEST_ANCHOR_METRIC.followupStepNoDateShare]: {
        unit: DIGEST_UNIT.share,
        direction: DIGEST_DIRECTION.down,
        defaultCallTypes: FOLLOWUP_TYPES,
        measure: rows => {
            const withStep = rows.filter(row => row.nextStep?.set === true);
            return digestShare(
                withStep.filter(row => !hasDatedNextStep(row)).length,
                withStep.length,
            );
        },
    },
    [DIGEST_ANCHOR_METRIC.lowScoreShare]: {
        unit: DIGEST_UNIT.share,
        direction: DIGEST_DIRECTION.down,
        measure: (rows, _anchor, context) => {
            const scores = scores10(rows);
            return digestShare(
                scores.filter(score => round1(score) <= context.lowScoreCallMax)
                    .length,
                scores.length,
            );
        },
    },
    [DIGEST_ANCHOR_METRIC.spiralsFullMean]: {
        unit: DIGEST_UNIT.perCall,
        direction: DIGEST_DIRECTION.up,
        defaultCallTypes: PRESENTATION_TYPES,
        measure: rows =>
            digestMean(
                rows.flatMap(row => {
                    const full = row.methodology?.spiralsFull;
                    return typeof full === 'number' ? [full] : [];
                }),
            ),
    },
    [DIGEST_ANCHOR_METRIC.checkpointsShare]: {
        unit: DIGEST_UNIT.share,
        direction: DIGEST_DIRECTION.up,
        measure: rows => {
            let done = 0;
            let total = 0;
            let n = 0;
            for (const row of rows) {
                const rowTotal = row.methodology?.checkpointsTotal ?? null;
                const rowDone = row.methodology?.checkpointsDone ?? null;
                if (rowTotal === null || rowDone === null || rowTotal <= 0) {
                    continue;
                }
                done += rowDone;
                total += rowTotal;
                n += 1;
            }
            return { value: total > 0 ? done / total : null, n };
        },
    },
};

/** Звонки якоря: его типы (или типы по умолчанию метрики), иначе все. */
export function digestAnchorRows(
    anchor: DigestAnchor,
    rows: readonly DatedLiteRow[],
): readonly DatedLiteRow[] {
    const types =
        anchor.callTypes ?? DIGEST_ANCHORS[anchor.metric].defaultCallTypes;
    return types
        ? rows.filter(
              row => row.callType !== null && types.includes(row.callType),
          )
        : rows;
}

/** Значение якоря по звонкам слоя качества менеджера за период. */
export function measureDigestAnchor(
    anchor: DigestAnchor,
    rows: readonly DatedLiteRow[],
    context: DigestMeasureContext,
): DigestValue {
    return DIGEST_ANCHORS[anchor.metric].measure(
        digestAnchorRows(anchor, rows),
        anchor,
        context,
    );
}

export const digestAnchorUnit = (anchor: DigestAnchor): DigestUnit =>
    DIGEST_ANCHORS[anchor.metric].unit;

export const digestAnchorDirection = (anchor: DigestAnchor): DigestDirection =>
    DIGEST_ANCHORS[anchor.metric].direction;
