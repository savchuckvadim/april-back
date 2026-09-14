import {
    AI_CAP_ACTIVITY_TYPES,
    AI_DURATION_ACTIVITY_TYPES,
    type AiCapActivityType,
    type AiDurationActivityType,
} from './registry.enums.const';
import type { ParamDescriptor } from './registry.types';

/** Дневные потолки полосы стажа по типу активности (анкета Ж, cap_level_activity). */
export const AI_CAP_ACTIVITY_DEFAULTS: Readonly<
    Record<AiCapActivityType, number>
> = { cold: 40, call: 25, presentation: 3 };

/** Средняя длительность активности по типу, минут (анкета Ж, activity_duration_min). */
export const AI_DURATION_MIN_DEFAULTS: Readonly<
    Record<AiDurationActivityType, number>
> = {
    cold: 6,
    call: 12,
    presentation: 45,
    refine: 15,
    decision: 15,
    payment: 8,
};

/** Код потолка по типу активности: `cap_cold`, `cap_call`, `cap_presentation`. */
export function capCode<T extends AiCapActivityType>(type: T): `cap_${T}` {
    return `cap_${type}`;
}

/** Код длительности по типу: `duration_min_cold` … `duration_min_payment`. */
export function durationMinCode<T extends AiDurationActivityType>(
    type: T,
): `duration_min_${T}` {
    return `duration_min_${type}`;
}

type CapParam = ParamDescriptor<number> & {
    readonly code: `cap_${AiCapActivityType}`;
};
type DurationMinParam = ParamDescriptor<number> & {
    readonly code: `duration_min_${AiDurationActivityType}`;
};

/**
 * Часть реестра, порождённая типами активностей (правило «один код = один
 * скаляр» для карт анкеты Ж `cap_level_activity` и `activity_duration_min`):
 * потолки дневного темпа — гибрид «дефолт → квантиль полосы стажа»,
 * длительности — гибрид «дефолт → медиана CALL_DURATION». Собирается через
 * `registry.plan.const.ts`.
 */
export const AI_ANALYTICS_CAP_PARAMS: readonly CapParam[] =
    AI_CAP_ACTIVITY_TYPES.map(type => ({
        code: capCode(type),
        title: `Потолок дневного темпа «${type}»`,
        scope: 'tenure',
        source: 'hybrid',
        unit: 'активностей в день',
        defaultValue: AI_CAP_ACTIVITY_DEFAULTS[type],
        range: [0.5, 200],
        phase: 2,
        breaksSeries: false,
        prior: AI_CAP_ACTIVITY_DEFAULTS[type],
        estimator:
            'квантиль cap_quantile дневного темпа полосы стажа по менеджер-дням',
        minN: 3,
        gate: '≥ 3 менеджера × 3 месяца без proxy-месяцев',
        description: `Скалярный потолок capacity типа ${type} (расщепление cap_level_activity): первое ребро, где N_k/D_rem выше потолка, делает цель недостижимой объёмом; до оценки берётся дефолт ${AI_CAP_ACTIVITY_DEFAULTS[type]} в день.`,
    }));

export const AI_ANALYTICS_DURATION_MIN_PARAMS: readonly DurationMinParam[] =
    AI_DURATION_ACTIVITY_TYPES.map(type => ({
        code: durationMinCode(type),
        title: `Длительность активности «${type}»`,
        scope: 'portal',
        source: 'hybrid',
        unit: 'минут',
        defaultValue: AI_DURATION_MIN_DEFAULTS[type],
        range: [1, 180],
        phase: 2,
        breaksSeries: false,
        prior: AI_DURATION_MIN_DEFAULTS[type],
        estimator: 'медиана CALL_DURATION по AI-типу звонка, w = n/(n + 30)',
        minN: 30,
        gate: '≥ 30 разобранных звонков типа за окно',
        description: `Бюджет времени плана дня и стоимость рычага volume для типа ${type} (расщепление activity_duration_min): до данных ${AI_DURATION_MIN_DEFAULTS[type]} минут, дальше медиана длительности звонков портала.`,
    }));
