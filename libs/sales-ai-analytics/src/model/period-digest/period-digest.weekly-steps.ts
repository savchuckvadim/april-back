import type { DatedLiteRow } from '../dated-lite-row';
import { digestModuleOf } from './modules';
import {
    DigestMeasureContext,
    measureDigestAnchor,
} from './period-digest.anchors';
import {
    DIGEST_LIFECYCLE,
    DIGEST_STATUS,
    DIGEST_STEP_STATE,
    DigestRecommendationCode,
    DigestStepState,
} from './period-digest.codes';
import {
    digestLastKnownValue,
    digestStatusOf,
    isDigestTargetAchieved,
} from './period-digest.status';
import {
    DIGEST_STEP_STATE_TITLE,
    formatAnchorValue,
    formatDigestTarget,
} from './period-digest.texts';
import type { DigestShift } from './period-digest.thresholds';
import type {
    DigestRecommendation,
    DigestValue,
    DigestWeeklyStep,
} from './period-digest.types';

/**
 * ШАГИ НЕДЕЛИ К ЦЕЛЯМ МЕСЯЦА: недельная карточка читает активные
 * рекомендации последней закрытой месячной карточки менеджера и меряет их
 * якоря по звонкам недели — «идёт к цели» (цель достигнута или сдвиг к ней
 * не меньше порога), «отстаёт», «за неделю мало данных». Свои недельные
 * рекомендации выдаются только по кодам, которых нет среди активных
 * месячных. Чистые функции.
 */

export interface DigestWeekInput extends DigestMeasureContext {
    /** Звонки слоя качества менеджера за неделю. */
    readonly rows: readonly DatedLiteRow[];
    /** Минимум наблюдений недели (3). */
    readonly minN: number;
    readonly shift: DigestShift;
}

/** Активные рекомендации месячной карточки. */
export const activeMonthRecommendations = (
    month: readonly DigestRecommendation[] | null,
): DigestRecommendation[] =>
    (month ?? []).filter(item => item.lifecycle === DIGEST_LIFECYCLE.active);

/** Коды, которые неделя своими рекомендациями не повторяет. */
export const weekExcludedCodes = (
    month: readonly DigestRecommendation[] | null,
): ReadonlySet<DigestRecommendationCode> =>
    new Set(activeMonthRecommendations(month).map(item => item.code));

function stepStateOf(
    recommendation: DigestRecommendation,
    week: DigestValue,
    input: DigestWeekInput,
): DigestStepState {
    if (week.value === null || week.n < input.minN) {
        return DIGEST_STEP_STATE.noData;
    }
    const achieved = isDigestTargetAchieved(
        recommendation.anchor,
        week.value,
        recommendation.target,
    );
    const status = digestStatusOf(
        recommendation.anchor,
        digestLastKnownValue(recommendation.history),
        week,
        { minN: input.minN, shift: input.shift },
    );
    return achieved || status === DIGEST_STATUS.improved
        ? DIGEST_STEP_STATE.onTrack
        : DIGEST_STEP_STATE.behind;
}

function stepTextOf(
    recommendation: DigestRecommendation,
    week: DigestValue,
    state: DigestStepState,
): string {
    const action = digestModuleOf(recommendation.code).weekAction(
        recommendation.anchor,
    );
    if (state === DIGEST_STEP_STATE.noData || week.value === null) {
        return `${action}: ${DIGEST_STEP_STATE_TITLE[DIGEST_STEP_STATE.noData]}.`;
    }
    return (
        `${action}: за неделю ${formatAnchorValue(recommendation.anchor, week.value)} ` +
        `при цели ${formatDigestTarget(recommendation.anchor, recommendation.target)} — ` +
        `${DIGEST_STEP_STATE_TITLE[state]}.`
    );
}

/** Шаги недели по активным рекомендациям месяца; месячной карточки нет — пусто. */
export function digestWeeklySteps(
    month: readonly DigestRecommendation[] | null,
    input: DigestWeekInput,
): DigestWeeklyStep[] {
    return activeMonthRecommendations(month).map(recommendation => {
        const week = measureDigestAnchor(
            recommendation.anchor,
            input.rows,
            input,
        );
        const state = stepStateOf(recommendation, week, input);
        return {
            code: recommendation.code,
            weekValue: week,
            target: recommendation.target,
            state,
            text: stepTextOf(recommendation, week, state),
        };
    });
}
