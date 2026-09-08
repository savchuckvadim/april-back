/**
 * Оси стиля менеджера (документ `ai/tasks/ai-analytics-manager-style.md`,
 * раздел 2.1) и контекст работы (2.2).
 *
 * Ось — это КАК менеджер работает, а не насколько хорошо: оба полюса
 * нейтральны по валентности, порядка и рейтинга по осям нет. Ось
 * `funnel_focus` и контекст (форма воронки, микс типов) подписей не дают —
 * они объясняют профиль, но не характеризуют человека.
 */

/** Оси стиля Фазы 2 (документ 2.1). */
export const STYLE_AXES = [
    'initiative',
    'inquiry',
    'funnel_focus',
    'persistence',
    'objection_response',
    'price_position',
    'tempo',
    'rhythm',
] as const;
export type StyleAxisCode = (typeof STYLE_AXES)[number];

/** Единица наблюдения оси — в ней считаются n и минимумы. */
export const STYLE_AXIS_UNITS = [
    'calls',
    'leads',
    'objections',
    'workdays',
    'deals',
] as const;
export type StyleAxisUnit = (typeof STYLE_AXIS_UNITS)[number];

export interface StyleAxisDescriptor {
    code: StyleAxisCode;
    /** Как ось называется РОПу (без оценочных слов). */
    title: string;
    /** Полюс −: он же нейтрален. */
    minus: string;
    /** Полюс +. */
    plus: string;
    unit: StyleAxisUnit;
}

export const STYLE_AXIS_DESCRIPTORS = [
    {
        code: 'initiative',
        title: 'Инициатива в разговоре',
        minus: 'даёт говорить',
        plus: 'задаёт ход',
        unit: 'calls',
    },
    {
        code: 'inquiry',
        title: 'Вопросы против презентации',
        minus: 'идёт от презентации',
        plus: 'исследует',
        unit: 'calls',
    },
    {
        code: 'funnel_focus',
        title: 'Куда уходят усилия по воронке',
        minus: 'набирает встречи',
        plus: 'доводит до оплаты',
        unit: 'deals',
    },
    {
        code: 'persistence',
        title: 'Повторные касания',
        minus: 'редкие касания',
        plus: 'много касаний',
        unit: 'leads',
    },
    {
        code: 'objection_response',
        title: 'Первая реакция на возражение',
        minus: 'отвечает по существу',
        plus: 'уточняет вопросом',
        unit: 'objections',
    },
    {
        code: 'price_position',
        title: 'Момент разговора о цене',
        minus: 'цена после ценности',
        plus: 'цена сразу',
        unit: 'calls',
    },
    {
        code: 'tempo',
        title: 'Темп работы',
        minus: 'размеренный темп',
        plus: 'быстрый темп',
        unit: 'workdays',
    },
    {
        code: 'rhythm',
        title: 'Ровность ритма',
        minus: 'гибкий',
        plus: 'ровный ритм',
        unit: 'workdays',
    },
] as const satisfies readonly StyleAxisDescriptor[];

const AXIS_BY_CODE: ReadonlyMap<StyleAxisCode, StyleAxisDescriptor> = new Map(
    STYLE_AXIS_DESCRIPTORS.map(axis => [axis.code, axis] as const),
);

/** Описание оси по коду. */
export const findStyleAxis = (
    code: StyleAxisCode,
): StyleAxisDescriptor | undefined => AXIS_BY_CODE.get(code);

/**
 * Форма воронки — контекст профиля, не ось и не подпись (документ 2.2):
 * конверсии рёбер это исход, а стиль исходом не измеряется. Значения
 * повторяют `AI_ANALYTICS_FUNNEL_SHAPES` приложения, но живут в библиотеке,
 * потому что модель не зависит от приложения.
 */
export const STYLE_FUNNEL_SHAPES = [
    'presenter',
    'closer',
    'balanced',
    'unknown',
] as const;
export type StyleFunnelShape = (typeof STYLE_FUNNEL_SHAPES)[number];
