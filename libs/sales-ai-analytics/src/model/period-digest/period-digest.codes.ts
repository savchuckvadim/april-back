/**
 * Коды карточки периода менеджера (`as const` + производные типы):
 * готовность данных, статус и жизненный цикл рекомендации, единицы и
 * направления метрик-якорей, коды якорей и модулей рекомендаций,
 * положение в отделе. Тексты для людей — period-digest.texts.ts.
 */

/** Хватает ли данных на карточку. */
export const DIGEST_READINESS = {
    ok: 'ok',
    /** Разобранных звонков меньше минимума: число есть, рекомендаций нет. */
    fewData: 'few_data',
    /** Записанных звонков нет вовсе. */
    noCalls: 'no_calls',
} as const;
export type DigestReadiness =
    (typeof DIGEST_READINESS)[keyof typeof DIGEST_READINESS];

/** Сдвиг метрики-якоря к прошлой оценке. */
export const DIGEST_STATUS = {
    /** Рекомендация выдана в этом периоде. */
    new: 'new',
    improved: 'improved',
    same: 'same',
    worse: 'worse',
    /** Данных на якорь меньше минимума. */
    noData: 'no_data',
} as const;
export type DigestStatus = (typeof DIGEST_STATUS)[keyof typeof DIGEST_STATUS];

/** Жизненный цикл рекомендации. */
export const DIGEST_LIFECYCLE = {
    active: 'active',
    /** Цель достигнута — «закрепить» (с пометкой «держать», если только на третьей оценке). */
    fixed: 'fixed',
    /** Три оценки без закрепления, хотя бы одна с данными, — «обсудить с РОПом». */
    escalated: 'escalated',
    /** Три оценки подряд без данных — «снята: данных не было» (решение 17.11.2026). */
    dropped: 'dropped',
} as const;
export type DigestLifecycle =
    (typeof DIGEST_LIFECYCLE)[keyof typeof DIGEST_LIFECYCLE];

/** Единица метрики-якоря: от неё зависит порог сдвига. */
export const DIGEST_UNIT = {
    /** Оценка 1–10. */
    score: 'score',
    /** Доля 0–1. */
    share: 'share',
    /** Среднее на звонок (полных спиралей на презентацию). */
    perCall: 'per_call',
} as const;
export type DigestUnit = (typeof DIGEST_UNIT)[keyof typeof DIGEST_UNIT];

/** Какое направление — к лучшему. */
export const DIGEST_DIRECTION = { up: 'up', down: 'down' } as const;
export type DigestDirection =
    (typeof DIGEST_DIRECTION)[keyof typeof DIGEST_DIRECTION];

/** Метрики, по которым меряется рекомендация (реестр — period-digest.anchors.ts). */
export const DIGEST_ANCHOR_METRIC = {
    /** Средняя оценка раздела (на звонках выбранных типов). */
    sectionMean: 'section_mean',
    /** Средняя оценка звонков с корзиной. */
    scoreMean: 'score_mean',
    /** Доля звонков со следующим шагом и датой. */
    nextStepDatedShare: 'next_step_dated_share',
    /** Доля звонков с назначенным следующим шагом. */
    nextStepSetShare: 'next_step_set_share',
    /** Доля возражений без отработки на доработке. */
    objectionUnhandledShare: 'objection_unhandled_share',
    /** Доля шагов без даты на доработке. */
    followupStepNoDateShare: 'followup_step_no_date_share',
    /** Доля звонков с низкой оценкой. */
    lowScoreShare: 'low_score_share',
    /** Полных спиралей в среднем на презентацию (методика). */
    spiralsFullMean: 'spirals_full_mean',
    /** Доля выполненных чек-пунктов методики. */
    checkpointsShare: 'checkpoints_share',
} as const;
export type DigestAnchorMetric =
    (typeof DIGEST_ANCHOR_METRIC)[keyof typeof DIGEST_ANCHOR_METRIC];

/** Коды модулей рекомендаций (модули — этап 4; `deals_stuck` — после 7.3). */
export const DIGEST_RECOMMENDATION_CODE = {
    presentationNeeds: 'presentation_needs',
    presentationFit: 'presentation_fit',
    presentationSpirals: 'presentation_spirals',
    followupObjections: 'followup_objections',
    followupStepDate: 'followup_step_date',
    nextStepDated: 'next_step_dated',
    lowScoreCalls: 'low_score_calls',
    worstSection: 'worst_section',
} as const;
export type DigestRecommendationCode =
    (typeof DIGEST_RECOMMENDATION_CODE)[keyof typeof DIGEST_RECOMMENDATION_CODE];

/** Кто сформулировал текст рекомендации. */
export const DIGEST_TEXT_SOURCE = { template: 'template', llm: 'llm' } as const;
export type DigestTextSource =
    (typeof DIGEST_TEXT_SOURCE)[keyof typeof DIGEST_TEXT_SOURCE];

/** Положение менеджера относительно середины отдела — только словами. */
export const DIGEST_POSITION = {
    above: 'above',
    middle: 'middle',
    below: 'below',
} as const;
export type DigestPosition =
    (typeof DIGEST_POSITION)[keyof typeof DIGEST_POSITION];

/** С кем сравнивали: свой отдел либо вся структура (в отделе меньше трёх). */
export const DIGEST_COMPARE_SCOPE = {
    department: 'department',
    structure: 'structure',
} as const;
export type DigestCompareScope =
    (typeof DIGEST_COMPARE_SCOPE)[keyof typeof DIGEST_COMPARE_SCOPE];

/** Направление изменения метрики к другому периоду (по величине). */
export const DIGEST_MOVEMENT = {
    up: 'up',
    down: 'down',
    flat: 'flat',
    noData: 'no_data',
} as const;
export type DigestMovement =
    (typeof DIGEST_MOVEMENT)[keyof typeof DIGEST_MOVEMENT];

/** Как неделя идёт к цели месячной рекомендации. */
export const DIGEST_STEP_STATE = {
    onTrack: 'on_track',
    behind: 'behind',
    noData: 'no_data',
} as const;
export type DigestStepState =
    (typeof DIGEST_STEP_STATE)[keyof typeof DIGEST_STEP_STATE];
