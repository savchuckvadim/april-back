/**
 * Типы реестра параметров AI-аналитики ОП (план `ai-sales-analytics-plan.md`,
 * раздел 4.1; анкета `ai-sales-analytics-inputs.md`, раздел Ж).
 *
 * Правило классов: **настройками бывают только решения людей** (планы,
 * определения событий, пороги внимания, потолки), **оценками — только
 * свойства данных** (нормы, κ, β, сезон, цикл, capacity, шум оценщика,
 * сверхдисперсия). Гибрид — настраиваемый прайор, вытесняемый данными по
 * весу `w`.
 *
 * Чистые типы: без DI, Bitrix и Prisma; значения параметров — только
 * примитивы (число, строка, флаг), никаких `any` и вложенных объектов.
 */

/** Слой, на котором параметр может быть переопределён. */
export type ParamScope = 'global' | 'portal' | 'tenure' | 'manager';

/** Класс параметра: решение человека, оценка из данных или их смесь. */
export type ParamSource = 'estimated' | 'configured' | 'hybrid';

/** Фаза внедрения, в которой параметр начинает использоваться. */
export type ParamPhase = 0 | 1 | 2 | 3 | 4;

/** Тип интервала ребра воронки: Уилсон для долей, гамма для интенсивностей. */
export type ParamIntervalKind = 'wilson' | 'gamma';

/** Оцениваемая величина ребра: интенсивность на агрегатах или вероятность. */
export type ParamEdgeEstimand = 'rate' | 'prob';

/** Оцениваемая величина наклона β (разложение Мундлака). */
export type ParamBetaEstimand = 'within' | 'between' | 'pooled';

/** Оцениваемая величина параметра (ребро или β). */
export type ParamEstimand = ParamEdgeEstimand | ParamBetaEstimand;

/** Допустимые типы значений параметра. */
export type ParamPrimitive = number | string | boolean;

/**
 * Вид значения параметра. Скаляры выводятся из типа дефолта; составные
 * значения по правилу «один код реестра = один скаляр» кодируются строкой:
 * `enum` — одно из `enumValues`, `csv` — список через запятую (элементы из
 * `enumValues`, если они заданы), `json` — строка с JSON-объектом или
 * массивом (карты по типам, списки правил, журналы).
 */
export type ParamValueKind =
    | 'number'
    | 'boolean'
    | 'string'
    | 'enum'
    | 'csv'
    | 'json';

/**
 * Значение параметра нужного типа. Обёртка нужна, чтобы в сигнатурах
 * читалось «значение параметра», а не безымянный union примитивов.
 */
export type ParamValue<T extends ParamPrimitive = ParamPrimitive> = T;

/** Границы допустимых значений числового параметра: [min, max]. */
export type ParamRange = readonly [min: number, max: number];

/** Дескриптор одного параметра модели. */
export interface ParamDescriptor<T extends ParamPrimitive = ParamPrimitive> {
    /** Код в snake_case — первичный ключ реестра. */
    readonly code: string;
    /** Название по-русски для «Как считаем» и админки. */
    readonly title: string;
    /** Слой переопределения. */
    readonly scope: ParamScope;
    /** Класс параметра (решение / оценка / гибрид). */
    readonly source: ParamSource;
    /** Единица измерения по-русски (дни, доля, баллы, ₽ за 1K токенов). */
    readonly unit: string;
    /** Глобальный дефолт — значение нижнего слоя `resolve`. */
    readonly defaultValue: ParamValue<T>;
    /** Границы для числовых значений; вне диапазона берётся дефолт. */
    readonly range?: ParamRange;
    /** Фаза внедрения. */
    readonly phase: ParamPhase;
    /** Смена значения рвёт сравнимость рядов (сдвигает `comparableFrom`). */
    readonly breaksSeries: boolean;
    /** Описание по-русски для блока «Как считаем». */
    readonly description: string;
    /** Для оцениваемых: как считается из данных. */
    readonly estimator?: string;
    /** Для оцениваемых: минимальный объём данных для оценки. */
    readonly minN?: number;
    /** Для оцениваемых: гейт публикации оценки. */
    readonly gate?: string;
    /** Для гибридов: числовой прайор, вытесняемый данными по весу `w`. */
    readonly prior?: number;
    /** Для рёбер воронки: тип интервала. */
    readonly intervalKind?: ParamIntervalKind;
    /** Для рёбер и β: оцениваемая величина. */
    readonly estimand?: ParamEstimand;
    /**
     * Вид значения; не задан — выводится из типа `defaultValue`. Для
     * `enum`/`csv`/`json` значение слоя проверяет `validateParamValue`.
     */
    readonly kind?: ParamValueKind;
    /** Допустимые значения для `enum` и элементов списка `csv`. */
    readonly enumValues?: readonly string[];
}

/** Откуда взято итоговое значение при разрешении параметра. */
export type ParamResolveSource =
    | 'default'
    | 'portal'
    | 'tenure'
    | 'manager'
    | 'hybrid';

/**
 * Почему значение слоя не было применено: число вне диапазона, чужой тип,
 * строка не из перечисления / битый CSV или JSON, неизвестный код.
 */
export type ParamResolveReason =
    | 'out-of-range'
    | 'type-mismatch'
    | 'invalid-value'
    | 'unknown-code';

/**
 * Слои переопределения. Ключ записи — код параметра, значение — сырое
 * содержимое JSON-настройки портала `[kpiSales]` (проверяется в `resolve`).
 */
export interface ParamContext {
    /** Настройки портала (`ai_analytics_model_params` и соседние ключи). */
    readonly portal?: Readonly<Record<string, unknown>>;
    /** Настройки полосы стажа (0–6 / 6–18 / 18+ мес.). */
    readonly tenureBand?: Readonly<Record<string, unknown>>;
    /** Настройки конкретного менеджера (`ai_analytics_manager_params`). */
    readonly manager?: Readonly<Record<string, unknown>>;
}

/**
 * Данные, уточняющие гибридный параметр: оценка из данных `data` и её вес
 * `w ∈ [0; 1]` (обычно `n/(n + κ)`), приходят из расчёта, а не из настроек.
 */
export interface ParamEvidence {
    /** Оценка из данных в тех же единицах, что и параметр. */
    readonly data?: number;
    /** Доля собственных данных в смеси. */
    readonly w?: number;
    /** Объём данных, на котором получена оценка. */
    readonly n?: number;
}

/** Результат `resolveParam`: значение, слой и раскрытие смеси для UI. */
export interface ResolvedParam {
    /** Код параметра. */
    readonly code: string;
    /** Итоговое значение. */
    readonly value: ParamPrimitive;
    /** Слой, давший значение. */
    readonly source: ParamResolveSource;
    /** Прайор смеси (настроенное значение) — только для гибрида. */
    readonly prior?: number;
    /** Оценка из данных — только для гибрида. */
    readonly data?: number;
    /** Вес данных в смеси — только для гибрида. */
    readonly w?: number;
    /** Объём данных — только для гибрида. */
    readonly n?: number;
    /** Причина отката к дефолту. */
    readonly reason?: ParamResolveReason;
}
