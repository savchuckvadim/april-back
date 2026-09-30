/**
 * Типы оценки эффекта советов — прокси гейта L5 (план §4.10 «уровни
 * доказательности и Goodhart-контроль», §10 «доля выполненных
 * рекомендаций и before/after КП/счетов с Уилсоном»; Фаза 4, поток П18).
 *
 * Чистые типы: без DI, Bitrix и Prisma. Тексты здесь не живут — только
 * числа и коды; подписи по-русски делает презентер приложения.
 */
import type { AiLever, OutcomeSample } from './lever.types';

/** Итог гейта ступени «рекомендации» (L5). */
export const RECOMMENDATION_GATE_STATUSES = [
    'pass',
    'fail',
    'insufficient',
] as const;

export type RecommendationGateStatus =
    (typeof RECOMMENDATION_GATE_STATUSES)[number];

/**
 * Причины, по которым гейт не пройден. Первые две дают `insufficient`
 * (данных не хватает — это не провал), остальные — `fail`.
 */
export const RECOMMENDATION_GATE_REASONS = [
    /** Советов с закрытым окном «после» меньше `recommendations_min_issued`. */
    'issued-below-min',
    /** Выданных советов меньше `n_min_none` — доли наружу не отдаются. */
    'issued-below-n-min',
    /** Нижняя граница интервала доли выполненных ниже `recommendations_done_share_min`. */
    'done-share-below',
    /** Верхняя граница интервала доли несогласий не ниже `recommendations_disagree_max`. */
    'disagree-above',
    /** Ни у одного ребра нижняя граница разности «после − до» не выше нуля. */
    'no-positive-edge',
    /** Детектор Гудхарта приложения поднял хотя бы один флаг. */
    'goodhart-flags',
] as const;

export type RecommendationGateReason =
    (typeof RECOMMENDATION_GATE_REASONS)[number];

/** Причины, означающие нехватку данных, а не провал гейта. */
export const RECOMMENDATION_INSUFFICIENT_REASONS = [
    'issued-below-min',
    'issued-below-n-min',
] as const satisfies readonly RecommendationGateReason[];

/** Выборки рёбер по кодам (коды рёбер — строки приложения). */
export type EdgeSamples = Readonly<Record<string, OutcomeSample>>;

/** Факт выдачи совета с исходом окон «до» и «после». */
export interface IssuedRecommendation {
    /** Ключ рекомендации (`leverKeyOf`). */
    readonly key: string;
    readonly lever: AiLever;
    readonly managerId: string;
    /** Месяц выдачи 'YYYY-MM'. */
    readonly monthKey: string;
    /** Отмечен выполненным. */
    readonly done: boolean;
    /** Есть реакция «не согласен». */
    readonly disagree: boolean;
    /** Рёбра окна «до» выдачи. */
    readonly before: EdgeSamples;
    /** Рёбра окна «после»; null — окно ещё не закрыто. */
    readonly after: EdgeSamples | null;
}

/** Параметры оценки (коды реестра в скобках). */
export interface RecommendationEffectParams {
    /** Минимум советов с закрытым окном (`recommendations_min_issued`). */
    readonly minIssued?: number;
    /** Порог нижней границы доли выполненных (`recommendations_done_share_min`). */
    readonly doneShareMin?: number;
    /** Порог верхней границы доли несогласий (`recommendations_disagree_max`). */
    readonly disagreeMax?: number;
    /** Ниже этого числа выданных доли не отдаются (`n_min_none`). */
    readonly minN?: number;
    /** Квантиль интервалов (`z_compare`). */
    readonly z?: number;
}

/** Вход Goodhart-контроля — итог детектора приложения за окно. */
export interface GoodhartCleanInput {
    /** Флагов расхождения пар. */
    readonly flags: number;
    /** Менеджеров хотя бы с одним флагом. */
    readonly managersWithFlags: number;
}

/** Вход оценки эффекта советов. */
export interface RecommendationEffectInput {
    readonly issued: readonly IssuedRecommendation[];
    readonly params?: RecommendationEffectParams;
    /** Без входа Goodhart-контроль не применяется. */
    readonly goodhart?: GoodhartCleanInput;
}

/** Доля с интервалом Уилсона; `null` — знаменатель ниже `n_min_none`. */
export interface ShareWithInterval {
    readonly value: number | null;
    readonly ci90: readonly [number, number] | null;
    /** Знаменатель доли. */
    readonly n: number;
}

/** Сравнение ребра «после − до» по советам с закрытым окном. */
export interface EdgeBeforeAfter {
    readonly edge: string;
    readonly before: OutcomeSample;
    readonly after: OutcomeSample;
    /**
     * Разность долей «после − до»; null — знаменатель «до» или «после»
     * меньше `n_min_none`.
     */
    readonly diff: number | null;
    /** Интервал разности по Ньюкомбу; null — вместе с `diff`. */
    readonly ci90: readonly [number, number] | null;
    /**
     * Окон менеджер × месяц выдачи с закрытым «после», у которых ребро
     * есть в обоих окнах; советы одного менеджера в один месяц — одно окно.
     */
    readonly n: number;
}

/** Свод по одному рычагу. */
export interface LeverEffect {
    readonly lever: AiLever;
    readonly issued: number;
    readonly completedWindows: number;
    readonly done: number;
    readonly disagree: number;
    readonly doneShare: ShareWithInterval;
    readonly disagreeShare: ShareWithInterval;
    readonly beforeAfter: readonly EdgeBeforeAfter[];
}

/** Итог гейта L5. */
export interface RecommendationGate {
    readonly status: RecommendationGateStatus;
    readonly reasons: readonly RecommendationGateReason[];
}

/** Применённые параметры оценки. */
export interface RecommendationEffectResolvedParams {
    readonly minIssued: number;
    readonly doneShareMin: number;
    readonly disagreeMax: number;
    readonly minN: number;
    readonly z: number;
}

/** Оценка эффекта советов за окно. */
export interface RecommendationEffect {
    readonly issued: number;
    /** Советов с закрытым окном «после». */
    readonly completedWindows: number;
    readonly done: number;
    readonly disagree: number;
    /** Доля выполненных по всем выданным. */
    readonly doneShare: ShareWithInterval;
    /** Доля несогласий по всем выданным. */
    readonly disagreeShare: ShareWithInterval;
    /** Своды по рычагам в порядке `AI_LEVERS`; только рычаги с выдачей. */
    readonly byLever: readonly LeverEffect[];
    /**
     * «После − до» по рёбрам по советам с закрытым окном; окно менеджер ×
     * месяц входит один раз, даже если советов в нём несколько.
     */
    readonly beforeAfter: readonly EdgeBeforeAfter[];
    readonly gate: RecommendationGate;
    readonly params: RecommendationEffectResolvedParams;
}
