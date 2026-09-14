/**
 * Рёбра воронки — единый источник кодов E1…E5 (план Фазы 2, §2.3) и часть
 * реестра, которая из них порождается: `funnel_edges`, нормы `mu_e*` и по
 * два кода на ребро (`e{n}_rate` — интенсивность на агрегатах, `e{n}_prob`
 * — вероятность продвижения эпизода). Историю интенсивностей в апостериоры
 * вероятностей не подмешиваем: у каждого кода своя история, μ, κ и
 * `comparableFrom`. Обобщённые `theta_edge_rate` / `theta_edge_prob`
 * остаются шаблоном значений по умолчанию (`registry.funnel.const.ts`).
 *
 * Чистые константы: без DI, Bitrix и Prisma.
 */
import type { ParamDescriptor, ParamEdgeEstimand } from './registry.types';

/** Коды рёбер канона: E1, E2, E3, E3′, E4, E5. */
export const AI_EDGE_CODES = [
    'e1',
    'e2',
    'e3',
    'e3_prime',
    'e4',
    'e5',
] as const;
export type AiEdgeCode = (typeof AI_EDGE_CODES)[number];

/** Какая κ применяется к ребру до оценки Клейнмана: ранняя или поздняя. */
export type AiEdgeKappaKind = 'early' | 'late';

/**
 * Полюса ребра — inner-коды KPI-фактов месяца (`call_done`,
 * `presentation_uniq_done`, `ev_*`) и продажа `dealsCount`; они принадлежат
 * витрине kpi-report, здесь только описывают канон.
 */
export interface AiEdgeDefinition {
    readonly code: AiEdgeCode;
    readonly title: string;
    readonly from: string;
    readonly to: string;
    readonly kappa: AiEdgeKappaKind;
    /** Норма ребра из дампа одного портала (решения владельца, §2.1). */
    readonly mu: number;
}

export const AI_EDGE_DEFINITIONS = [
    {
        code: 'e1',
        title: 'звонок → уникальная презентация',
        from: 'call_done',
        to: 'presentation_uniq_done',
        kappa: 'early',
        mu: 0.045,
    },
    {
        code: 'e2',
        title: 'презентация → КП',
        from: 'presentation_uniq_done',
        to: 'ev_offer_pres_act_send',
        kappa: 'late',
        mu: 0.47,
    },
    {
        code: 'e3',
        title: 'презентация → счёт после презентации',
        from: 'presentation_uniq_done',
        to: 'ev_invoice_pres_act_send',
        kappa: 'late',
        mu: 0.27,
    },
    {
        code: 'e3_prime',
        title: 'звонок → счёт без презентации',
        from: 'call_done',
        to: 'ev_invoice_act_send',
        kappa: 'early',
        mu: 0.027,
    },
    {
        code: 'e4',
        title: 'счёт → продажа',
        from: 'ev_invoice_act_send',
        to: 'dealsCount',
        kappa: 'late',
        mu: 0.105,
    },
    {
        code: 'e5',
        title: 'презентация → продажа',
        from: 'presentation_uniq_done',
        to: 'dealsCount',
        kappa: 'late',
        mu: 0.09,
    },
] as const satisfies readonly AiEdgeDefinition[];

/** Строка — код ребра канона. */
export const isAiEdgeCode = (value: string): value is AiEdgeCode =>
    (AI_EDGE_CODES as readonly string[]).includes(value);

/** Код реестра ребра для оцениваемой величины: `e2_rate`, `e3_prime_prob`. */
export function edgeCode<E extends AiEdgeCode, K extends ParamEdgeEstimand>(
    edge: E,
    estimand: K,
): `${E}_${K}` {
    return `${edge}_${estimand}`;
}

/** Код реестра нормы ребра: `mu_e1` … `mu_e5`. */
export function muEdgeCode<E extends AiEdgeCode>(edge: E): `mu_${E}` {
    return `mu_${edge}`;
}

/** Ребро канона по полюсам (`call_done`, `presentation_uniq_done`) либо undefined. */
export function edgeByEndpoints(
    from: string,
    to: string,
): AiEdgeDefinition | undefined {
    return AI_EDGE_DEFINITIONS.find(
        edge => edge.from === from && edge.to === to,
    );
}

type MuEdgeParam = ParamDescriptor<number> & {
    readonly code: `mu_${AiEdgeCode}`;
};
type EdgeRateParam = ParamDescriptor<number> & {
    readonly code: `${AiEdgeCode}_rate`;
};
type EdgeProbParam = ParamDescriptor<number> & {
    readonly code: `${AiEdgeCode}_prob`;
};

/** Нормы рёбер μ по слоям: гибрид «дефолт из дампа → данные портала». */
export const AI_ANALYTICS_MU_EDGE_PARAMS: readonly MuEdgeParam[] =
    AI_EDGE_DEFINITIONS.map(edge => ({
        code: muEdgeCode(edge.code),
        title: `Норма ребра «${edge.title}»`,
        scope: 'portal',
        source: 'hybrid',
        unit: 'доля входов ребра',
        defaultValue: edge.mu,
        range: [0.001, 0.99],
        phase: 2,
        breaksSeries: false,
        prior: edge.mu,
        estimator:
            'leave-one-out по менеджерам портала (полоса стажа → портал), усадка κ_layer = ρ_κ·median(ñ)',
        minN: 3,
        gate: '≥ 3 менеджера в слое; до пула порталов — только слой портала',
        description: `Норма слоя μ_lk ребра ${edge.from} → ${edge.to}: прайор из дампа (${edge.mu}) вытесняется данными портала по весу w = n/(n + κ); κ по умолчанию — ${edge.kappa === 'early' ? 'kappa_edge_early' : 'kappa_edge_late'}.`,
    }));

/** Интенсивность ребра на агрегатах `result_total` (до сцепки со сделкой). */
export const AI_ANALYTICS_EDGE_RATE_PARAMS: readonly EdgeRateParam[] =
    AI_EDGE_DEFINITIONS.map(edge => ({
        code: edgeCode(edge.code, 'rate'),
        title: `Интенсивность ребра «${edge.title}»`,
        scope: 'manager',
        source: 'estimated',
        unit: 'событий на 100 входов ребра',
        defaultValue: 0,
        range: [0, 200],
        phase: 2,
        breaksSeries: false,
        estimator:
            'Gamma-Poisson по агрегатам месяца: (s̃ + κ_k·μ_lk)/(ñ + κ_k), забывание λ',
        minN: 30,
        gate: 'доля сцепки звонок → сделка ниже deal_chain_min_pct',
        intervalKind: 'gamma',
        estimand: 'rate',
        description: `Ребро ${edge.from} → ${edge.to} как интенсивность на агрегатах: s ≤ n не гарантируется, интервал — гамма-отношением; до данных значение равно норме слоя mu_${edge.code} при w = 0.`,
    }));

/** Вероятность продвижения эпизода по ребру (после сцепки со сделкой). */
export const AI_ANALYTICS_EDGE_PROB_PARAMS: readonly EdgeProbParam[] =
    AI_EDGE_DEFINITIONS.map(edge => ({
        code: edgeCode(edge.code, 'prob'),
        title: `Вероятность продвижения по ребру «${edge.title}»`,
        scope: 'manager',
        source: 'estimated',
        unit: 'доля',
        defaultValue: 0,
        range: [0, 1],
        phase: 3,
        breaksSeries: false,
        estimator:
            'Beta-биномиал по эпизодам сделки: (s̃ + κ_k·μ_lk)/(ñ + κ_k), инвариант s ≤ n',
        minN: 30,
        gate: 'сцепка ≥ deal_chain_min_pct два пересчёта подряд (выход при < deal_chain_exit_pct)',
        intervalKind: 'wilson',
        estimand: 'prob',
        description: `Ребро ${edge.from} → ${edge.to} как вероятность продвижения эпизода со своей историей: ряды интенсивностей сюда не подмешиваются, при s > n — confidence none с причиной mixed-sources.`,
    }));

/**
 * Коды рёбер витрины kpi-report-sales (`AI_ANALYTICS_FUNNEL_EDGES` в
 * `constants/ai-overview.const.ts`) — другая нумерация: четыре ребра,
 * уже отданные фронту как поле DTO. Библиотека приложение не импортирует,
 * поэтому коды продублированы литералами; равенство проверяет спека
 * приложения.
 */
export const AI_ANALYTICS_EDGE_VIEW_CODES = [
    'call_to_presentation',
    'presentation_to_offer',
    'offer_to_invoice',
    'invoice_to_sale',
] as const;
export type AiAnalyticsEdgeViewCode =
    (typeof AI_ANALYTICS_EDGE_VIEW_CODES)[number];

/**
 * Соответствие «ребро канона E1…E5 ↔ код витрины» (план §2.3). Витрина
 * держит четыре ребра: E1 — звонок → презентация, E2 — презентация → КП,
 * E4 — счёт → продажа; «КП → счёт» витрины не входит в канон (E3 идёт от
 * презентации), а E3′ и E5 витрине не показываются — null.
 */
export const AI_ANALYTICS_EDGE_VIEW_MAP: Readonly<
    Record<AiEdgeCode, AiAnalyticsEdgeViewCode | null>
> = {
    e1: 'call_to_presentation',
    e2: 'presentation_to_offer',
    e3: null,
    e3_prime: null,
    e4: 'invoice_to_sale',
    e5: null,
};

/** Часть реестра, порождённая рёбрами, плюс список рёбер и темп активностей. */
export const AI_ANALYTICS_EDGE_PARAMS = [
    {
        code: 'funnel_edges',
        title: 'Рёбра воронки портала',
        scope: 'portal',
        source: 'configured',
        unit: 'коды рёбер через запятую',
        defaultValue: AI_EDGE_CODES.join(','),
        phase: 2,
        breaksSeries: false,
        kind: 'csv',
        enumValues: AI_EDGE_CODES,
        description:
            'Подмножество рёбер канона E1, E2, E3, E3′, E4, E5, по которым портал считает нормы, разрыв воронки и рычаги; выключенное ребро не участвует в разложении разрыва.',
    },
    {
        code: 'rate_manager_activity',
        title: 'Апостериорный темп активностей менеджера',
        scope: 'manager',
        source: 'estimated',
        unit: 'активностей на рабочий день',
        defaultValue: 0,
        range: [0, 200],
        phase: 2,
        breaksSeries: false,
        estimator:
            'Gamma-Poisson: (Ñ/φ + κ_a·μ_lk)/(D̃/φ + κ_a) с забыванием λ по месяцам',
        minN: 5,
        gate: 'D_mt ≥ min_workdays_month и daysSource ≠ proxy',
        intervalKind: 'gamma',
        description:
            'Темп a_mk по типу активности на рабочий день с усадкой к норме слоя силой kappa_activity_days; до данных равен норме слоя (w = 0), интервал — гамма.',
    },
    ...AI_ANALYTICS_MU_EDGE_PARAMS,
    ...AI_ANALYTICS_EDGE_RATE_PARAMS,
    ...AI_ANALYTICS_EDGE_PROB_PARAMS,
] as const satisfies readonly ParamDescriptor[];
