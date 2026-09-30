import {
    RU_FORMS,
    ruCount,
    type AiAnalyticsParamCode,
    type ParamResolveReason,
    type ParamResolveSource,
    type ParamSource,
    type RuPluralForms,
} from '@lib/sales-ai-analytics';

/**
 * Блок «Как считаем» (план Фазы 2 §6, долг 26 волны C): словарь ручек,
 * подписи оценок модели и причины её отсутствия. Тексты по ручкам — в
 * `ai-analytics-about.texts.const.ts` (вынесены по лимиту 300 строк).
 *
 * Правило владельца: всё, что читает руководитель, — простым русским, без
 * формул, греческих букв, кодов и жаргона. Числа в блоке НЕ пишутся
 * руками — их подставляет билдер из реестра и снапшота модели портала.
 */
export const AI_ABOUT_ROUTE = 'about' as const;

/** Сегмент `requestKey` конверта: `…:{domain}:about:{endpoint}`. */
export const AI_ABOUT_KEY_SECTION = 'about' as const;

/** Ручки витрины, у которых есть блок «Как считаем». */
export const AI_ABOUT_ENDPOINTS = [
    'overview',
    'plan/daily',
    'plan-fact',
    'brief',
    'manager/style',
    'dossier',
    'forecast',
] as const;
export type AiAboutEndpoint = (typeof AI_ABOUT_ENDPOINTS)[number];

/** Класс параметра реестра: оценка из данных, решение человека, гибрид. */
export const AI_ABOUT_PARAM_CLASSES = [
    'estimated',
    'configured',
    'hybrid',
] as const satisfies readonly ParamSource[];

/** Слой, давший значение параметра при разрешении. */
export const AI_ABOUT_PARAM_LAYERS = [
    'default',
    'portal',
    'tenure',
    'manager',
    'hybrid',
] as const satisfies readonly ParamResolveSource[];

/** Почему значение слоя не применено и взят дефолт реестра. */
export const AI_ABOUT_RESOLVE_REASONS = [
    'out-of-range',
    'type-mismatch',
    'invalid-value',
    'unknown-code',
] as const satisfies readonly ParamResolveReason[];

/**
 * Оценки модели портала в блоке: код реестра, короткая подпись (поле
 * `symbol` DTO — раньше там была греческая буква) и полное название.
 */
export const AI_ABOUT_ESTIMATES = {
    kappa: {
        code: 'kappa_edge_late',
        symbol: 'сила усадки',
        title: 'Насколько сильно цифры менеджера подтягиваются к норме',
    },
    phi: {
        code: 'overdispersion_default',
        symbol: 'разброс между менеджерами',
        title: 'Насколько сильно темпы менеджеров отличаются друг от друга',
    },
    lambda: {
        code: 'forget_lambda',
        symbol: 'память ряда',
        title: 'Как быстро забываются прошлые месяцы',
    },
} as const satisfies Readonly<
    Record<
        string,
        { code: AiAnalyticsParamCode; symbol: string; title: string }
    >
>;

/** «для 1 из 4 шагов воронки» — родительный падеж. */
const FUNNEL_STEPS_GENITIVE: RuPluralForms = ['шага', 'шагов', 'шагов'];

/** Пояснения к источнику оценки модели — словами. */
export const AI_ABOUT_ESTIMATE_NOTES = {
    /** Часть шагов воронки уточнена по данным портала. */
    edgesEstimated: (estimated: number, total: number): string =>
        estimated >= total
            ? 'для всех шагов воронки норма уточнена по данным портала'
            : `для ${estimated} из ${ruCount(total, FUNNEL_STEPS_GENITIVE)} ` +
              'воронки норма уточнена по данным портала, для остальных — ' +
              'стандартное значение',
    estimated: 'оценено по данным портала',
    notEstimated:
        'по данным портала пока не оценивается — стандартное значение',
    configuredByPortal: 'задано настройкой портала',
    configured: 'задано настройкой — стандартное значение',
} as const;

/** Почему в блоке нет модели портала — честная деградация (§5.4). */
export const AI_ABOUT_MODEL_REASONS = {
    missing:
        'Расчёт по порталу ещё не готов: ночной пересчёт за месяц не ' +
        'выполнялся. Параметры показаны по стандартным значениям и ' +
        'настройкам портала; пока расчёт по порталу не готов, витрина ' +
        'показывает только описательные цифры, без норм.',
    unavailable:
        'Не удалось прочитать расчёт по порталу. Параметры показаны по ' +
        'стандартным значениям и настройкам портала.',
} as const;

/**
 * Числа для строк блока — только из реестра со слоями портала: билдер
 * отдаёт действующее значение кода, текст подставляет его в слова.
 */
export interface AiAboutNumbers {
    /** Действующее числовое значение кода; у нечисловых кодов — дефолт. */
    readonly value: (code: AiAnalyticsParamCode) => number;
}

/** Строка блока: готовый текст или текст с числами из реестра. */
export type AiAboutLine = string | ((numbers: AiAboutNumbers) => string);

export interface AiAboutEndpointText {
    readonly endpoint: AiAboutEndpoint;
    readonly title: string;
    readonly purpose: string;
    /** Откуда берутся данные. */
    readonly sources: readonly string[];
    /** Как читать результат; числа — из реестра через билдер. */
    readonly howToRead: readonly AiAboutLine[];
    /** Чего ручка не делает (границы). */
    readonly notDoing: readonly string[];
    /** Коды реестра, которые ручка использует (проверяется спекой). */
    readonly params: readonly AiAnalyticsParamCode[];
}

/** «3 месяца», «5 месяцев» — для окон и сроков в строках блока. */
export const aboutMonths = (count: number): string =>
    ruCount(count, RU_FORMS.months);
