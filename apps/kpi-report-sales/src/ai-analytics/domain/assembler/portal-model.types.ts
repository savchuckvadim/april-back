/**
 * Нагрузки месячной модели портала и дневного прогноза (план §3.1,
 * поток 16a) в том виде, в каком они ложатся в `user_result` записи `ais`.
 *
 * Базовая форма `PortalModelSnapshot` объявлена в библиотеке и принадлежит
 * потоку хранилища снапшотов — здесь она только расширяется полями
 * Фазы 2 (источники оценок, стадийные θ, шкала лага, трактовка рёбер,
 * готовность, сезон, санити-панель, журнал событий и НОРМЫ ПО КАЖДОМУ
 * МЕНЕДЖЕРУ). Расширение на стороне приложения — то же решение, что у
 * менеджерских снапшотов (§1.6 п. 8).
 *
 * Нормы по менеджерам лежат в снапшоте намеренно: leave-one-out по
 * 6–12 месяцам × менеджеры × рёбра считается ОДИН раз за месяц, а витрина
 * (поток 16b) их только читает — иначе каждый запрос обзора превращался бы
 * в квадратичный пересчёт (риск потока 16a).
 *
 * Все поля JSON-сериализуемы: `Date` внутри нагрузок запрещены (§3.2).
 */
import type {
    AiBetaSource,
    AiEdgeEstimand,
    BetaGateCountdown,
    CapacitySource,
    LagCdfKind,
    MsSource,
    NormLayer,
    ParamContext,
    PortalEdgeNorm,
    PortalModelSnapshot,
    QualityGroup,
    SaleLag,
    StageTheta,
} from '@lib/sales-ai-analytics';
import type { PortalRosterMember } from '@lib/sales-ai-analytics/model/portal-events';
import type { AiPortalEvent } from '@lib/sales-ai-analytics/settings/ai-settings.types';
import type {
    AiPortalEstimateSource,
    AiPortalKappaSource,
} from '../../constants/ai-portal-model.const';
import type { AiSanityReport } from '../../steps/sanity.types';
import type { AiSnapshotMeta } from './manager-snapshot.types';

/** Ребро воронки в месячном снапшоте менеджера — вход норм портала. */
export interface PortalMonthEdge {
    edge: string;
    /** Вошло в ребро — знаменатель. */
    n: number;
    /** Сделано — числитель. */
    s: number;
}

/**
 * Месяц менеджера в объёме, нужном модели портала. Читается структурно
 * из нагрузки снапшота: чужая или неполная форма деградирует до нулей и
 * не роняет месячный шаг (§5.4).
 */
export interface PortalManagerMonth {
    monthKey: string;
    managerId: string;
    /** Полоса стажа паспорта; null — сразу слой портала. */
    tenureBand: string | null;
    edges: PortalMonthEdge[];
    /** Менеджер-месяц исключён из оценки норм (прокси или мало дней). */
    excludeFromNorms: boolean;
    /** D_mt — отработанных дней месяца (знаменатель дневного темпа). */
    workedDays: number;
    /** Источник знаменателя экспозиции ('calendar' | 'absences' | 'proxy'). */
    daysSource: string | null;
    /** Звонков за месяц (KPI-вектор) — числитель дневного темпа. */
    callsDone: number;
    /** Подтверждённых презентаций за месяц. */
    presentations: number;
    /** Закрытых продаж за месяц. */
    salesCount: number;
    /** Средний чек месяца, ₽; null — продаж не было. */
    averageCheck: number | null;
    /** План руководителя на месяц (снимок 1-го числа); null — плана нет. */
    planSales: number | null;
    /** Уровень менеджера — по нему берётся цель уровня. */
    level: string | null;
    /** Средняя оценка месяца по шкале 1–10 и её объём; null — разборов нет. */
    score: { value: number; n: number } | null;
}

/** Норма портала по ребру: μ, κ и то, как они получены. */
export interface PortalEdgeNormFacts extends PortalEdgeNorm {
    /** Слой нормы портала: полоса стажа, портал или глобальный дефолт. */
    layer: NormLayer;
    /** Менеджеров в пуле нормы. */
    managers: number;
    /** Источник силы усадки: настройка реестра или оценка Клейнмана. */
    kappaSource: AiPortalKappaSource;
    /** Деталь оценки κ: early | late | kleinman. */
    kappaKind: string;
    /** Гейт Клейнмана («≥ 6 мес. и ≥ 5 менеджеров») открыт. */
    kappaGateOpen: boolean;
    /** Оценка внутриклассовой корреляции ρ̂; null — не считалась. */
    rho: number | null;
    /** ρ̂ ≤ 0 — менеджеры неразличимы, усадка полная. */
    homogeneous: boolean;
}

/** Норма ребра для одного менеджера (leave-one-out). */
export interface PortalManagerEdgeNorm {
    edge: string;
    /** μ слоя БЕЗ данных этого менеджера. */
    mu: number;
    layer: NormLayer;
    /** Знаменатель слоя без менеджера. */
    n: number;
    /** Доля данных слоя w ∈ [0; 1]. */
    w: number;
    /** Сила усадки κ ребра (общая на портал). */
    kappa: number;
}

/** Нормы одного менеджера по всем рёбрам — их читает витрина. */
export interface PortalManagerNorms {
    managerId: string;
    tenureBand: string | null;
    edges: PortalManagerEdgeNorm[];
}

/** Точка шкалы лага `F(d)`: день и накопленная доля продаж. */
export interface PortalLagCdfPoint {
    days: number;
    value: number;
}

/** Шкала `F(d)` в снапшоте: вид оценки, медиана, объём и таблица. */
export interface PortalLagCdfFacts {
    kind: LagCdfKind;
    /** Медиана лага, дней; null — таблица пуста. */
    medianDays: number | null;
    /** Продаж в оценке. */
    n: number;
    points: PortalLagCdfPoint[];
}

/** Вероятность продажи из стадии в снапшоте модели. */
export interface PortalStageThetaFacts {
    stageCode: string;
    order: number;
    /** Сделок с известным исходом. */
    n: number;
    /** Из них дошедших до продажи. */
    s: number;
    /** E[θ] — вероятность продажи из стадии с усадкой к норме слоя. */
    value: number;
    /** Доля собственных данных w ∈ [0; 1]. */
    w: number;
    /** 90 %-интервал; null — интервал не определён. */
    ci90: [number, number] | null;
}

/** Сезонный индекс с подписью: в Фазе 2 всегда единица (§4.7). */
export interface PortalSeasonFacts {
    index: number;
    source: AiPortalEstimateSource;
    note: string;
}

/** Оценка со своим источником: сверхдисперсия, m_S, S_ref, cap. */
export interface PortalEstimate<TSource extends string> {
    value: number;
    source: TSource;
}

/**
 * Модель портала за месяц (`ai-analytics-portal-model`): нормы рёбер и
 * менеджеров, параметры усадки, потолок темпа, шкала лага, стадийные θ,
 * трактовка рёбер, режим связи качества с исходом, готовность, санити и
 * журнал событий.
 */
export interface PortalModelPayload extends PortalModelSnapshot {
    monthKey: string;
    /** Окно оценки: месяцы 'YYYY-MM' по возрастанию. */
    window: string[];
    /** Менеджер-месяцев в окне после отсева excludeFromNorms. */
    observations: number;
    /** Менеджеров в окне. */
    managers: number;
    edges: PortalEdgeNormFacts[];
    /** Нормы по менеджерам — витрина читает их, а не считает заново. */
    managerNorms: PortalManagerNorms[];
    /** φ — сверхдисперсия темпов активностей. */
    overdispersion: PortalEstimate<AiPortalEstimateSource>;
    /** Источник m_S: ANOVA, дефолт или «менеджеры неразличимы». */
    msSource: MsSource;
    /** Менеджеров, прошедших ценз ANOVA. */
    msGroups: number;
    /** Источник опорной оценки S_ref. */
    sRefSource: AiPortalEstimateSource;
    /** Источник потолка дневного темпа. */
    capSource: CapacitySource;
    /** Тип активности, по которому посчитан потолок. */
    capActivity: string;
    /** Шкала лага продажи `F(d)`. */
    lagCdf: PortalLagCdfFacts;
    stageTheta: PortalStageThetaFacts[];
    /** Доля сцепки звонков со сделками, %. */
    chainSharePct: number;
    /** Трактовка рёбер портала: интенсивность или вероятность. */
    edgeKind: AiEdgeEstimand;
    /** Код причины трактовки (справочник библиотеки). */
    edgeKindReason: string;
    /** Режим связи «качество → исход». */
    betaSource: AiBetaSource;
    /** Счётчик «до оценки β»; null — гейт пройден либо считать не из чего. */
    betaCountdown: BetaGateCountdown | null;
    season: PortalSeasonFacts;
    /** Отчёт недельной санити-панели; null — панель не отрабатывала. */
    sanity: AiSanityReport | null;
    /** Журнал портала после пересчёта (ручные записи + автособытия). */
    events: AiPortalEvent[];
    /** Автособытия, найденные ЭТИМ пересчётом (их дописывает журнал). */
    detectedEvents: AiPortalEvent[];
    /** Модель переиспользована с прошлого месяца (данных не было). */
    reused: boolean;
    /** Почему переиспользована; null — модель посчитана заново. */
    reusedReason: string | null;
    /** Сигнатура источников — по ней следующий пересчёт ловит автособытия. */
    signature: PortalModelSignature;
    meta: AiSnapshotMeta;
}

/**
 * Сигнатура источников пересчёта. Сравнение с сигнатурой прошлой модели и
 * есть обнаружение автособытий журнала: без неё «раньше было иначе»
 * пришлось бы искать в чужих снапшотах.
 */
export interface PortalModelSignature {
    /** Версия рубрики разбора в окне; null — версий в разборах нет. */
    rubricVersion: string | null;
    /** Хэш методички (скрипта); null — источника пока нет. */
    scriptHash: string | null;
    /** Медиана среднего чека месяца, ₽; null — продаж не было. */
    priceMedian: number | null;
}

/** Значения ночного конвейера, которых нет в месячных снапшотах. */
export interface PortalModelFacts {
    /** Вероятности продажи из стадии (шина `stageTheta`). */
    readonly stageThetas?: readonly StageTheta[];
    /** Лаги продаж под шкалу `F(d)` (из эпизодов шины). */
    readonly saleLags?: readonly SaleLag[];
    /** Доля сцепки звонков со сделками, %. */
    readonly chainSharePct?: number;
    /** Трактовка рёбер портала на этот пересчёт. */
    readonly edgeKind?: AiEdgeEstimand;
    /** Код причины трактовки (справочник библиотеки). */
    readonly edgeKindReason?: string;
    /** Медиана цикла по фактам; null — значение реестра. */
    readonly cycleMedianDays?: number | null;
    /** Глубина истории стадий, месяцев. */
    readonly historyMonths?: number;
    /** Сырые оценки разборов по менеджерам (шкала 1–10) для ANOVA. */
    readonly qualityGroups?: readonly QualityGroup[];
    /** Реестр менеджеров с датами начала стажа (автособытие new_hire). */
    readonly roster?: readonly PortalRosterMember[];
    /** Версия рубрики разбора в окне (автособытие rubric_change). */
    readonly rubricVersion?: string | null;
    /** Хэш методички (автособытие script_change). */
    readonly scriptHash?: string | null;
    /** Отчёт недельной санити-панели; null — берётся из прошлой модели. */
    readonly sanity?: AiSanityReport | null;
    /** Слои реестра прогона; без них параметры загружаются заново. */
    readonly registry?: ParamContext;
    readonly paramsVersion?: string;
    readonly comparableFrom?: string;
    readonly calcVersion?: string;
    readonly inputsHash?: string;
}

/** Запрос месячного пересчёта модели портала. */
export interface PortalModelRequest {
    readonly domain: string;
    /** Месяц модели 'YYYY-MM'. */
    readonly monthKey: string;
    /** Перезаписать модель, даже если за месяц она уже посчитана. */
    readonly forceRefresh?: boolean;
    readonly facts?: PortalModelFacts;
}

/** Итог месячного пересчёта: что записано и почему деградировало. */
export interface PortalModelResult {
    /** id записи `ais`; null — запись не создавалась. */
    readonly id: string | null;
    readonly payload: PortalModelPayload | null;
    /** Модель переиспользована с прошлого месяца. */
    readonly reused: boolean;
    /** Причина деградации; null — модель посчитана по данным окна. */
    readonly reason: string | null;
    /** Прочитано менеджер-месяцев. */
    readonly months: number;
    /** Записано снапшотов (0 или 1). */
    readonly written: number;
}
