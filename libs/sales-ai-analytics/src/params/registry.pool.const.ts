import type { AiEdgeCode } from './registry.edges.const';
import { AI_PRODUCT_LINES } from './registry.enums.const';
import type { ParamDescriptor } from './registry.types';

/** Рёбра индекса навыка I_m и их веса (анкета Ж, skill_index_weights). */
export const AI_SKILL_INDEX_EDGES = [
    'e1',
    'e2',
    'e3',
    'e4',
] as const satisfies readonly AiEdgeCode[];
export type AiSkillIndexEdge = (typeof AI_SKILL_INDEX_EDGES)[number];

/** Слагаемые индекса навыка: четыре ребра и качество. */
export type AiSkillWeightKey = AiSkillIndexEdge | 'quality';

/** Веса индекса навыка: рёбра E1…E4 и качество, Σ = 1, каждый ≤ 0,4. */
export const AI_SKILL_WEIGHT_DEFAULTS: Readonly<
    Record<AiSkillWeightKey, number>
> = { e1: 0.15, e2: 0.15, e3: 0.2, e4: 0.25, quality: 0.25 };

/** Код веса индекса навыка: `skill_weight_e1` … `skill_weight_quality`. */
export function skillWeightCode<K extends AiSkillWeightKey>(
    key: K,
): `skill_weight_${K}` {
    return `skill_weight_${key}`;
}

type SkillWeightParam = ParamDescriptor<number> & {
    readonly code: `skill_weight_${AiSkillWeightKey}`;
};

const SKILL_WEIGHT_KEYS = [...AI_SKILL_INDEX_EDGES, 'quality'] as const;

/** Веса индекса навыка по слагаемым — защита от Goodhart: каждое ≤ 0,4. */
export const AI_ANALYTICS_SKILL_WEIGHT_PARAMS: readonly SkillWeightParam[] =
    SKILL_WEIGHT_KEYS.map(key => ({
        code: skillWeightCode(key),
        title: `Вес «${key}» в индексе навыка`,
        scope: 'global',
        source: 'configured',
        unit: 'доля индекса',
        defaultValue: AI_SKILL_WEIGHT_DEFAULTS[key],
        range: [0, 0.4],
        phase: 3,
        breaksSeries: false,
        description: `Слагаемое индекса навыка I_m для ${key === 'quality' ? 'качества разборов' : `ребра ${key.toUpperCase()}`} (расщепление skill_index_weights): веса пяти слагаемых в сумме дают 1, ни одно не больше 0,4, чтобы индекс нельзя было «сделать» одним показателем.`,
    }));

/**
 * Часть реестра: пул порталов и продуктовая линейка, эксперименты, версии
 * и индекс навыка (план §2.1: product_pool, pool_min_portals,
 * experiment_design_params, calc_version, params_version,
 * skill_index_weights). Собирается в `registry.const.ts`.
 */
export const AI_ANALYTICS_POOL_PARAMS = [
    {
        code: 'experiments_enabled',
        title: 'Эксперименты включены',
        scope: 'portal',
        source: 'configured',
        unit: 'флаг',
        defaultValue: false,
        phase: 3,
        breaksSeries: false,
        description:
            'Решение владельца А.5: реестр экспериментов ai_analytics_experiments выключен; при включении рекомендации уровня E3 требуют пререгистрированной метрики и правила остановки.',
    },
    {
        code: 'experiment_crossover_weeks',
        title: 'Длина плеча кроссовера',
        scope: 'portal',
        source: 'configured',
        unit: 'недель',
        defaultValue: 4,
        range: [2, 8],
        phase: 3,
        breaksSeries: false,
        description:
            'Сколько недель менеджер работает в одном условии до переключения (расщепление experiment_design_params); короче двух недель эффект тонет в недельной сезонности.',
    },
    {
        code: 'experiment_washout_weeks',
        title: 'Пауза между плечами кроссовера',
        scope: 'portal',
        source: 'configured',
        unit: 'недель',
        defaultValue: 1,
        range: [0, 4],
        phase: 3,
        breaksSeries: false,
        description:
            'Недель washout между условиями (расщепление experiment_design_params), чтобы эффект предыдущего условия не переносился на следующее.',
    },
    {
        code: 'experiment_wedge_months',
        title: 'Шаг stepped-wedge',
        scope: 'portal',
        source: 'configured',
        unit: 'месяцев',
        defaultValue: 1,
        range: [1, 2],
        phase: 3,
        breaksSeries: false,
        description:
            'Через сколько месяцев следующая группа менеджеров переходит в новое условие при дизайне stepped-wedge (расщепление experiment_design_params).',
    },
    {
        code: 'product_line',
        title: 'Продуктовая линейка портала',
        scope: 'portal',
        source: 'configured',
        unit: 'код линейки',
        defaultValue: AI_PRODUCT_LINES[0],
        phase: 2,
        breaksSeries: false,
        kind: 'enum',
        enumValues: AI_PRODUCT_LINES,
        description:
            'Пул прайоров строится только внутри одной линейки (KS-тест чека и цикла): порталы разных продуктов друг другу нормы не подсказывают (расщепление product_pool).',
    },
    {
        code: 'product_pool_months',
        title: 'Договор по умолчанию',
        scope: 'portal',
        source: 'configured',
        unit: 'месяцев',
        defaultValue: 12,
        range: [3, 36],
        phase: 2,
        breaksSeries: false,
        description:
            'Типичная длительность договора линейки для перевода продаж в деньги и сравнения чека внутри пула (расщепление product_pool).',
    },
    {
        code: 'pool_opt_in',
        title: 'Согласие на обезличенный пул прайоров',
        scope: 'portal',
        source: 'configured',
        unit: 'флаг',
        defaultValue: false,
        phase: 2,
        breaksSeries: false,
        description:
            'Решение владельца А.3: портал в пул не входит и прайоры пула не получает; при false kappa_portal_to_global не поднимается выше нуля (расщепление product_pool).',
    },
    {
        code: 'pool_min_portals',
        title: 'Минимум порталов для глобального пула',
        scope: 'global',
        source: 'configured',
        unit: 'порталов',
        defaultValue: 3,
        range: [3, 10],
        phase: 4,
        breaksSeries: false,
        description:
            'Сколько порталов с историей ≥ 6 месяцев нужно, чтобы глобальный слой μ_0, κ̄, SI_0, β_pool и τ_0 оценивался из данных, а не оставался дефолтом дампа.',
    },
    {
        code: 'calc_version',
        title: 'Версия кода модели',
        scope: 'global',
        source: 'configured',
        unit: 'semver с префиксом sam-',
        defaultValue: 'sam-1.0.0',
        phase: 1,
        breaksSeries: false,
        description:
            'Semver расчёта: префикс кэша v{major}; смена major рвёт тренды и помечает старые снапшоты superseded. Сдвиг comparableFrom считается по paramsVersion, а не по этому полю.',
    },
    {
        code: 'params_version',
        title: 'Версия параметров портала',
        scope: 'portal',
        source: 'estimated',
        unit: 'sha256 hex',
        defaultValue: '',
        phase: 2,
        breaksSeries: false,
        estimator:
            'sha256 канонического JSON эффективных настроек портала и менеджеров вместе с registryVersion',
        minN: 0,
        gate: 'вычисляется при каждом сохранении настроек',
        description:
            'Хэш paramsVersion, который кладётся в каждый снапшот и DTO рядом с inputsHash и modelSnapshotId; пустая строка — настройки ещё не сохранялись.',
    },
    ...AI_ANALYTICS_SKILL_WEIGHT_PARAMS,
] as const satisfies readonly ParamDescriptor[];
