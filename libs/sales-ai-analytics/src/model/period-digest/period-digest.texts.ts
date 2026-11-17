import {
    callTypeTitleOf,
    sectionTitleOf,
    upperFirst,
} from '../dictionary-titles.util';
import { ruDecimal } from '../ru-text.util';
import {
    digestAnchorDirection,
    digestAnchorUnit,
} from './period-digest.anchors';
import {
    DIGEST_ANCHOR_METRIC,
    DIGEST_COMPARE_SCOPE,
    DIGEST_DIRECTION,
    DIGEST_LIFECYCLE,
    DIGEST_POSITION,
    DIGEST_READINESS,
    DIGEST_STATUS,
    DIGEST_STEP_STATE,
    DIGEST_UNIT,
    DigestAnchorMetric,
    DigestCompareScope,
    DigestLifecycle,
    DigestPosition,
    DigestReadiness,
    DigestStatus,
    DigestStepState,
    DigestUnit,
} from './period-digest.codes';
import type {
    DigestAnchor,
    DigestPeriodKind,
    DigestRecommendation,
    DigestStanding,
} from './period-digest.types';

/**
 * Подписи карточки периода для людей — по-русски, без кодов: вид периода,
 * готовность данных, сдвиг и состояние рекомендации, положение в отделе,
 * названия метрик-якорей и числа в их единицах.
 */

export const DIGEST_PERIOD_KIND_TITLE: Readonly<
    Record<DigestPeriodKind, string>
> = { week: 'неделя', month: 'месяц' };

export const DIGEST_READINESS_TITLE: Readonly<Record<DigestReadiness, string>> =
    {
        [DIGEST_READINESS.ok]: 'данных достаточно',
        [DIGEST_READINESS.fewData]: 'мало данных',
        [DIGEST_READINESS.noCalls]: 'нет записанных звонков',
    };

/** «Было → стало → сдвиг есть / нет / данных мало». */
export const DIGEST_STATUS_TITLE: Readonly<Record<DigestStatus, string>> = {
    [DIGEST_STATUS.new]: 'новая',
    [DIGEST_STATUS.improved]: 'стало лучше',
    [DIGEST_STATUS.same]: 'без изменений',
    [DIGEST_STATUS.worse]: 'стало хуже',
    [DIGEST_STATUS.noData]: 'данных мало',
};

export const DIGEST_LIFECYCLE_TITLE: Readonly<Record<DigestLifecycle, string>> =
    {
        [DIGEST_LIFECYCLE.active]: 'в работе',
        [DIGEST_LIFECYCLE.fixed]: 'закрепить',
        [DIGEST_LIFECYCLE.escalated]: 'обсудить с РОПом',
        [DIGEST_LIFECYCLE.dropped]: 'снята: данных не было',
    };

/** Как неделя идёт к цели месячной рекомендации. */
export const DIGEST_STEP_STATE_TITLE: Readonly<
    Record<DigestStepState, string>
> = {
    [DIGEST_STEP_STATE.onTrack]: 'идёт к цели',
    [DIGEST_STEP_STATE.behind]: 'отстаёт',
    [DIGEST_STEP_STATE.noData]: 'за неделю мало данных',
};

/** Пометка к «закрепить», когда цель достигнута только на третьей оценке. */
export const DIGEST_HOLD_NOTE = 'держать';

/** Подпись «молчания» (решение 17.11.2026). */
export const DIGEST_SILENT_DAYS_TITLE = 'дней без записанных звонков';

/** Пометка к сравнению, когда периоды считались разными версиями разбора. */
export const DIGEST_VERSIONS_DIFFER_NOTE = 'считалось другой версией разбора';

const POSITION_TITLE: Readonly<
    Record<DigestPosition, Readonly<Record<DigestCompareScope, string>>>
> = {
    [DIGEST_POSITION.above]: {
        [DIGEST_COMPARE_SCOPE.department]: 'выше середины отдела',
        [DIGEST_COMPARE_SCOPE.structure]: 'выше середины по отделам продаж',
    },
    [DIGEST_POSITION.middle]: {
        [DIGEST_COMPARE_SCOPE.department]: 'около середины отдела',
        [DIGEST_COMPARE_SCOPE.structure]: 'около середины по отделам продаж',
    },
    [DIGEST_POSITION.below]: {
        [DIGEST_COMPARE_SCOPE.department]: 'ниже середины отдела',
        [DIGEST_COMPARE_SCOPE.structure]: 'ниже середины по отделам продаж',
    },
};

/** Положение словами; сравнения нет — пустая строка. */
export const digestStandingTitle = (standing: DigestStanding | null): string =>
    standing ? POSITION_TITLE[standing.position][standing.scope] : '';

/** Состояние рекомендации: «в работе», «закрепить — держать», «обсудить…». */
export const digestLifecycleTitle = (
    recommendation: Pick<DigestRecommendation, 'lifecycle' | 'hold'>,
): string =>
    recommendation.hold
        ? `${DIGEST_LIFECYCLE_TITLE[recommendation.lifecycle]} — ${DIGEST_HOLD_NOTE}`
        : DIGEST_LIFECYCLE_TITLE[recommendation.lifecycle];

/**
 * Снятая рекомендация показывается один раз одной строкой:
 * «Доля звонков с низкой оценкой — снята: данных не было».
 */
export const digestDroppedLine = (
    recommendation: Pick<DigestRecommendation, 'anchor'>,
): string =>
    `${upperFirst(digestAnchorTitle(recommendation.anchor))} — ` +
    DIGEST_LIFECYCLE_TITLE[DIGEST_LIFECYCLE.dropped];

/** Число в единицах: «4,2 из 10», «41 %», «1,3». */
export function formatDigestValue(unit: DigestUnit, value: number): string {
    if (unit === DIGEST_UNIT.score) return `${ruDecimal(value)} из 10`;
    if (unit === DIGEST_UNIT.share) return `${Math.round(value * 100)} %`;
    return ruDecimal(value);
}

/** Значение якоря в его единицах. */
export const formatAnchorValue = (
    anchor: DigestAnchor,
    value: number,
): string => formatDigestValue(digestAnchorUnit(anchor), value);

/** Цель «меньше — лучше» не выше этого считается нулём. */
export const DIGEST_ZERO_TARGET = 0.005;

/**
 * Цель якоря: «5,2», «58 %», у «меньше — лучше» — «не больше 40 %» (цель
 * ноль — просто «0 %»).
 */
export function formatDigestTarget(
    anchor: DigestAnchor,
    target: number,
): string {
    const unit = digestAnchorUnit(anchor);
    const text =
        unit === DIGEST_UNIT.score
            ? ruDecimal(target)
            : formatDigestValue(unit, target);
    const atMost =
        digestAnchorDirection(anchor) === DIGEST_DIRECTION.down &&
        target > DIGEST_ZERO_TARGET;
    return atMost ? `не больше ${text}` : text;
}

const METRIC_TITLE: Readonly<Record<DigestAnchorMetric, string>> = {
    [DIGEST_ANCHOR_METRIC.sectionMean]: 'оценка раздела',
    [DIGEST_ANCHOR_METRIC.scoreMean]: 'средняя оценка звонков',
    [DIGEST_ANCHOR_METRIC.nextStepDatedShare]:
        'доля звонков со следующим шагом и датой',
    [DIGEST_ANCHOR_METRIC.nextStepSetShare]:
        'доля звонков с назначенным следующим шагом',
    [DIGEST_ANCHOR_METRIC.objectionUnhandledShare]:
        'доля возражений без ответа на доработке',
    [DIGEST_ANCHOR_METRIC.followupStepNoDateShare]:
        'доля шагов без даты на доработке',
    [DIGEST_ANCHOR_METRIC.lowScoreShare]: 'доля звонков с низкой оценкой',
    [DIGEST_ANCHOR_METRIC.spiralsFullMean]:
        'полных спиралей в среднем на презентацию',
    [DIGEST_ANCHOR_METRIC.checkpointsShare]:
        'доля выполненных пунктов методики',
};

/**
 * Название метрики-якоря: раздел — его названием из рубрики («Выявление
 * потребностей»), типы звонков — названиями из справочника.
 */
export function digestAnchorTitle(anchor: DigestAnchor): string {
    const base =
        anchor.metric === DIGEST_ANCHOR_METRIC.sectionMean && anchor.section
            ? `«${sectionTitleOf(anchor.section)}»`
            : METRIC_TITLE[anchor.metric];
    if (!anchor.callTypes?.length) return base;
    const types = anchor.callTypes
        .map(type => `«${callTypeTitleOf(type)}»`)
        .join(', ');
    return `${base} на звонках ${types}`;
}
