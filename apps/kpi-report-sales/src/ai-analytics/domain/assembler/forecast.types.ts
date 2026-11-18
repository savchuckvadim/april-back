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
    AiForecastEntry,
    AiForecastMethod,
    DailyPlan,
    FunnelLeak,
    LeverCandidate,
    ParamContext,
    PipelineEpisode,
    PipelineEpisodeShare,
} from '@lib/sales-ai-analytics';
import type {
    ForecastFlowFacts,
    ForecastFlowManagerInput,
    PortalFlow,
} from './forecast-flow.types';
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
    /**
     * Учтённых звонков за месяц — вход плана дня и рычагов (воронка по
     * рёбрам). В середину прогноза не входит: она считается от презентаций.
     */
    readonly entryDone: number;
    /** Вход прогноза от презентаций (метод `presentations-v2`). */
    readonly flow: ForecastFlowManagerInput;
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
    /**
     * Средняя оценка разборов месяца (шкала 1–10) и их число — вход
     * рычага и утечки качества при связи «по данным»; null — разборов нет.
     */
    readonly quality?: { readonly score: number; readonly n: number } | null;
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
    /** Подбор доли продаж на презентацию и сдвига на месяц (портал). */
    readonly flow: PortalFlow;
    readonly manager: ForecastManagerInput;
    /** Зерно сэмплирования утечек: два прогона с ним дают один результат. */
    readonly seed: number;
    readonly meta: AiSnapshotMeta;
}

/** Сколько самых «тяжёлых» открытых сделок сохраняем в разложении. */
export const AI_FORECAST_TOP_EPISODES = 5;

/**
 * Входы расчёта прогноза менеджера — для разложения в админке. С методом
 * `presentations-v2` вход — отмеченные презентации: `entryDone·…·fBar`
 * даёт ожидание от новых презентаций (`fBar = w_0·r`). Без поля `method`
 * у записи — старый расчёт: вход по звонкам, `conversion = Π θ` по пути.
 */
export interface ForecastBreakdown {
    /** Сделано входной активности с начала месяца. */
    entryDone: number;
    /** Темп входной активности в рабочий день. */
    entryRate: number;
    /** Продаж на единицу входной активности. */
    conversion: number;
    /** Какая доля продаж новой активности придётся на остаток месяца. */
    fBar: number;
    /** Открытых сделок (справочно: в середину прогноза не входят). */
    openEpisodes: number;
    /** Сделки с наибольшим вкладом в ожидание; пусто — истории стадий нет. */
    topEpisodes: PipelineEpisodeShare[];
}

/** Нагрузка снапшота `ai-analytics-forecast` за день менеджера. */
export interface ForecastPayload {
    day: string;
    monthKey: string;
    /**
     * Середина прогноза месяца. `presentations-v2`:
     * `Y₀ + backlog + fresh` (от проведённых и от новых презентаций); без
     * поля `method` — старый расчёт `Y₀ + λ_pipe + λ_new`.
     */
    p50: number;
    /** «Сделано + уже в работе»: `Y₀ + backlog` (`calls-v1`: `Y₀ + λ_pipe`). */
    descriptive: number;
    /** Наивная база: линейная экстраполяция темпа месяца. */
    naive: number;
    /** Наивная база «как в прошлом месяце»; null — прошлого месяца нет. */
    naiveLastMonth: number | null;
    /**
     * `λ_pipe` — ожидание от открытых сделок; null — истории стадий нет
     * (см. `pipelineReason`). С `presentations-v2` — справочно: в середину
     * не входит (двойной счёт с прошлыми презентациями), остаётся входом
     * плана дня до его пересмотра.
     */
    pipelineExpected: number | null;
    /** Причина отсутствия `λ_pipe`; null — значение посчитано. */
    pipelineReason: string | null;
    /** Ожидание от новой активности до конца месяца (v2 — от презентаций). */
    newFlowExpected: number;
    /** Метод расчёта; нет поля — запись до 18.11.2026 (`calls-v1`). */
    method?: AiForecastMethod;
    /** Счётчик презентаций — вход (`presentations-v2`). */
    entry?: AiForecastEntry;
    /** Факты расчёта от презентаций (`presentations-v2`). */
    flow?: ForecastFlowFacts;
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
    /** Входы расчёта; нет поля — запись до 16.11.2026. */
    breakdown?: ForecastBreakdown;
    meta: AiSnapshotMeta;
}
