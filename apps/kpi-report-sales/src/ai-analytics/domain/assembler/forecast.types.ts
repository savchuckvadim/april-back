/**
 * Типы дневного прогноза менеджера (план Фазы 2, §4.8–§4.10, поток 16a):
 * вход по менеджеру, вход сборки и нагрузка снапшота
 * `ai-analytics-forecast`.
 *
 * Вынесено из `forecast.assembler.ts`, чтобы рабочий файл остался в
 * пределах 300 строк (прецедент — `model/daily-plan.types.ts`
 * библиотеки). Все поля JSON-сериализуемы: `Date` внутри нагрузок
 * запрещены (§3.2).
 */
import type {
    DailyPlan,
    FunnelLeak,
    LeverCandidate,
    ParamContext,
    PipelineEpisode,
} from '@lib/sales-ai-analytics';
import type { AiSnapshotMeta } from './manager-snapshot.types';
import type {
    PortalManagerNorms,
    PortalModelPayload,
} from './portal-model.types';

/** Ребро менеджера за месяц: сколько вошло и сколько прошло. */
export interface ForecastEdgeFact {
    readonly edge: string;
    readonly n: number;
    readonly s: number;
}

/** Вход прогноза по одному менеджеру. */
export interface ForecastManagerInput {
    readonly managerId: string;
    /** `Y₀` — закрытые продажи месяца. */
    readonly doneSales: number;
    /** Сделано входной активности за месяц (числитель дневного темпа). */
    readonly entryDone: number;
    /** План руководителя на месяц; null — плана нет. */
    readonly planHead: number | null;
    /** Личная цель менеджера (`target_override`); null — не задана. */
    readonly override: number | null;
    /** Цель уровня из настроек; null — не задана. */
    readonly levelTarget: number | null;
    /** Факт прошлого месяца — наивная база при пустом текущем. */
    readonly lastMonthSales: number | null;
    /** Открытые эпизоды на день расчёта. */
    readonly openEpisodes: readonly PipelineEpisode[];
    /** Рёбра менеджера за месяц. */
    readonly edges: readonly ForecastEdgeFact[];
    /** Нормы менеджера из модели портала; null — норм нет. */
    readonly norms: PortalManagerNorms | null;
}

/** Вход сборки прогноза: день, календарь, модель портала и менеджер. */
export interface ForecastBuildInput {
    /** День прогноза 'YYYY-MM-DD' в TZ портала. */
    readonly day: string;
    readonly monthKey: string;
    /** Рабочих дней месяца всего. */
    readonly workdaysInMonth: number;
    /** Прошедших рабочих дней месяца. */
    readonly daysElapsed: number;
    /** Оставшихся рабочих дней месяца, включая сегодня. */
    readonly daysLeft: number;
    readonly model: PortalModelPayload;
    /** id записи модели — он же `meta.modelSnapshotId`. */
    readonly modelSnapshotId: string | null;
    /** История стадий нужной глубины есть; false → `pipelineExpected: null`. */
    readonly hasStageHistory: boolean;
    readonly registry: ParamContext;
    readonly manager: ForecastManagerInput;
    /** Зерно сэмплирования утечек: два прогона с ним дают один результат. */
    readonly seed: number;
    readonly meta: AiSnapshotMeta;
}

/** Нагрузка снапшота `ai-analytics-forecast` за день менеджера. */
export interface ForecastPayload {
    day: string;
    monthKey: string;
    /** `P50 = Y₀ + λ_pipe + λ_new`. */
    p50: number;
    /** Описательная часть `Y₀ + λ_pipe`. */
    descriptive: number;
    /** Наивная база: линейная экстраполяция темпа месяца. */
    naive: number;
    /** Наивная база «как в прошлом месяце»; null — прошлого месяца нет. */
    naiveLastMonth: number | null;
    /** `λ_pipe`; null — истории стадий нет (см. `pipelineReason`). */
    pipelineExpected: number | null;
    /** Причина отсутствия `λ_pipe`; null — значение посчитано. */
    pipelineReason: string | null;
    /** `λ_new` — ожидание от новых активностей остатка месяца. */
    newFlowExpected: number;
    /** `Y₀` — закрытые продажи месяца. */
    doneSales: number;
    /** Цель месяца и её источник. */
    target: { value: number; source: string; empty: boolean };
    /** `N_req` — требуемый объём входной активности до конца месяца. */
    requiredVolume: number;
    daysElapsed: number;
    daysLeft: number;
    /** План на день по типам активности. */
    plan: DailyPlan;
    /** Топ рычагов (не больше трёх). */
    levers: LeverCandidate[];
    /** Утечки рёбер — вклад каждого ребра в недобор продаж. */
    leaks: FunnelLeak[];
    meta: AiSnapshotMeta;
}
