import {
    digestAnchorDirection,
    digestAnchorUnit,
} from './period-digest.anchors';
import {
    DIGEST_DIRECTION,
    DIGEST_LIFECYCLE,
    DIGEST_STATUS,
    DIGEST_UNIT,
    DigestLifecycle,
    DigestRecommendationCode,
    DigestStatus,
    DigestTextSource,
} from './period-digest.codes';
import {
    DIGEST_MAX_ACTIVE,
    DIGEST_MAX_EVALUATIONS,
    DigestShift,
    digestShiftOf,
} from './period-digest.thresholds';
import type {
    DigestAnchor,
    DigestPoint,
    DigestRecommendation,
    DigestValue,
} from './period-digest.types';

/**
 * СТАТУС И ЖИЗНЕННЫЙ ЦИКЛ рекомендации (решения владельца 01.11 и
 * ведущего 17.11.2026):
 *  - статус оценки — сдвиг якоря к последнему значению с данными:
 *    «стало лучше / без изменений / стало хуже», мало данных — `no_data`;
 *  - цель достигнута две оценки подряд — «закрепить»;
 *  - живёт три оценки после выдачи: на третьей цель достигнута — «закрепить»
 *    с пометкой «держать», не достигнута — «обсудить с РОПом», а если ни
 *    одна оценка не была с данными — «снята: данных не было»;
 *  - закрытые не переносятся; активных у менеджера не больше трёх,
 *    перенесённые первыми.
 * Чистые функции.
 */

export interface DigestStatusOptions {
    /** Минимум наблюдений под якорем (3 за неделю, 5 за месяц). */
    readonly minN: number;
    readonly shift?: DigestShift;
}

const EPSILON = 1e-9;

const sign = (anchor: DigestAnchor): number =>
    digestAnchorDirection(anchor) === DIGEST_DIRECTION.up ? 1 : -1;

/** Сдвиг якоря к опорному значению с учётом направления и порога. */
export function digestStatusOf(
    anchor: DigestAnchor,
    reference: number | null,
    current: DigestValue,
    options: DigestStatusOptions,
): DigestStatus {
    if (current.value === null || current.n < options.minN) {
        return DIGEST_STATUS.noData;
    }
    if (reference === null) return DIGEST_STATUS.same;
    const threshold = digestShiftOf(digestAnchorUnit(anchor), options.shift);
    const gain = (current.value - reference) * sign(anchor);
    if (gain >= threshold - EPSILON) return DIGEST_STATUS.improved;
    if (gain <= -threshold + EPSILON) return DIGEST_STATUS.worse;
    return DIGEST_STATUS.same;
}

/** Цель достигнута: значение не хуже цели с учётом направления. */
export function isDigestTargetAchieved(
    anchor: DigestAnchor,
    value: number | null,
    target: number,
): boolean {
    if (value === null) return false;
    return (value - target) * sign(anchor) >= -EPSILON;
}

/** Границы шкалы единицы: оценка 1–10, доля 0–1, на звонок — от нуля. */
const clampToScale = (anchor: DigestAnchor, value: number): number => {
    const unit = digestAnchorUnit(anchor);
    if (unit === DIGEST_UNIT.score) return Math.min(10, Math.max(1, value));
    if (unit === DIGEST_UNIT.share) return Math.min(1, Math.max(0, value));
    return Math.max(0, value);
};

/**
 * Цель на следующий период: база на два порога сдвига в лучшую сторону,
 * но не дальше нормы, если норма лучше базы хотя бы на порог (норма —
 * порог «слабого» плюс сдвиг, норма спиралей методики, середина отдела).
 * Значение ограничено шкалой единицы.
 */
export function digestTargetOf(
    anchor: DigestAnchor,
    baseline: number,
    options: {
        readonly shift?: DigestShift;
        readonly norm?: number | null;
    } = {},
): number {
    const threshold = digestShiftOf(digestAnchorUnit(anchor), options.shift);
    const direction = sign(anchor);
    const candidate = baseline + 2 * threshold * direction;
    const norm = options.norm ?? null;
    const target =
        norm !== null && (norm - baseline) * direction >= threshold - EPSILON
            ? direction > 0
                ? Math.min(candidate, norm)
                : Math.max(candidate, norm)
            : candidate;
    return clampToScale(anchor, target);
}

/** Новая рекомендация: точка выдачи — статус «новая», оценок ещё нет. */
export function newDigestRecommendation(input: {
    readonly code: DigestRecommendationCode;
    readonly text: string;
    readonly source: DigestTextSource;
    readonly anchor: DigestAnchor;
    readonly periodKey: string;
    readonly baseline: { readonly value: number; readonly n: number };
    readonly target: number;
    readonly evidence: DigestRecommendation['evidence'];
}): DigestRecommendation {
    return {
        code: input.code,
        text: input.text,
        source: input.source,
        anchor: input.anchor,
        baseline: { periodKey: input.periodKey, ...input.baseline },
        target: input.target,
        history: [
            {
                periodKey: input.periodKey,
                value: input.baseline.value,
                n: input.baseline.n,
                status: DIGEST_STATUS.new,
                achieved: isDigestTargetAchieved(
                    input.anchor,
                    input.baseline.value,
                    input.target,
                ),
            },
        ],
        status: DIGEST_STATUS.new,
        evaluations: 0,
        lifecycle: DIGEST_LIFECYCLE.active,
        hold: false,
        evidence: input.evidence,
    };
}

/** Последнее значение истории с данными — опора для статуса. */
export const digestLastKnownValue = (
    history: readonly DigestPoint[],
): number | null =>
    [...history].reverse().find(point => point.value !== null)?.value ?? null;

/**
 * Исход после последней оценки: цель достигнута — «закрепить» («держать»);
 * нет — «обсудить с РОПом», если хоть одна оценка была с данными, иначе
 * «снята: данных не было» (решение 17.11.2026).
 */
function finalLifecycle(
    achieved: boolean,
    evaluated: readonly DigestPoint[],
): DigestLifecycle {
    if (achieved) return DIGEST_LIFECYCLE.fixed;
    return evaluated.some(point => point.value !== null)
        ? DIGEST_LIFECYCLE.escalated
        : DIGEST_LIFECYCLE.dropped;
}

/**
 * Оценка активной рекомендации в новом периоде. Повтор того же периода
 * (пересчёт карточки) ничего не меняет.
 */
export function evaluateDigestRecommendation(
    recommendation: DigestRecommendation,
    current: DigestValue,
    periodKey: string,
    options: DigestStatusOptions,
): DigestRecommendation {
    const last = recommendation.history[recommendation.history.length - 1];
    if (recommendation.lifecycle !== DIGEST_LIFECYCLE.active) {
        return recommendation;
    }
    if (last?.periodKey === periodKey) return recommendation;
    const status = digestStatusOf(
        recommendation.anchor,
        digestLastKnownValue(recommendation.history),
        current,
        options,
    );
    const value = status === DIGEST_STATUS.noData ? null : current.value;
    const achieved = isDigestTargetAchieved(
        recommendation.anchor,
        value,
        recommendation.target,
    );
    const evaluations = recommendation.evaluations + 1;
    const point: DigestPoint = {
        periodKey,
        value,
        n: current.n,
        status,
        achieved,
    };
    // Выдача не считается оценкой: две оценки подряд — после выдачи.
    const previousAchieved =
        recommendation.evaluations > 0 && last ? last.achieved : false;
    const fixed = achieved && previousAchieved;
    const final = evaluations >= DIGEST_MAX_EVALUATIONS;
    const lifecycle = fixed
        ? DIGEST_LIFECYCLE.fixed
        : final
          ? finalLifecycle(achieved, [
                ...recommendation.history.slice(1),
                point,
            ])
          : DIGEST_LIFECYCLE.active;
    return {
        ...recommendation,
        history: [...recommendation.history, point],
        status,
        evaluations,
        lifecycle,
        hold: !fixed && final && achieved,
    };
}

/**
 * Перенос рекомендаций прошлой карточки: активные оцениваются по новому
 * периоду, закрытые в прошлый раз («закрепить», «обсудить») — не
 * переносятся (их уже показали).
 */
export function carryDigestRecommendations(
    previous: readonly DigestRecommendation[],
    measure: (anchor: DigestAnchor) => DigestValue,
    periodKey: string,
    options: DigestStatusOptions,
): DigestRecommendation[] {
    return previous
        .filter(item => item.lifecycle === DIGEST_LIFECYCLE.active)
        .map(item =>
            evaluateDigestRecommendation(
                item,
                measure(item.anchor),
                periodKey,
                options,
            ),
        );
}

/**
 * Набор рекомендаций карточки: перенесённые (и закрытые в этом периоде —
 * их показывают один раз) плюс новые на свободные места, чтобы активных
 * было не больше `maxActive`. Код, который уже есть среди перенесённых,
 * новой рекомендацией не повторяется.
 */
export function mergeDigestRecommendations(
    carried: readonly DigestRecommendation[],
    fresh: readonly DigestRecommendation[],
    maxActive: number = DIGEST_MAX_ACTIVE,
): DigestRecommendation[] {
    const taken = new Set(carried.map(item => item.code));
    const active = carried.filter(
        item => item.lifecycle === DIGEST_LIFECYCLE.active,
    ).length;
    const slots = Math.max(0, maxActive - active);
    const added: DigestRecommendation[] = [];
    for (const item of fresh) {
        if (added.length >= slots) break;
        if (taken.has(item.code)) continue;
        taken.add(item.code);
        added.push(item);
    }
    return [...carried, ...added];
}
