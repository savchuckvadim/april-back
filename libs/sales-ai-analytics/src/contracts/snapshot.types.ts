/**
 * Контракты снапшотов Фазы 2 в таблице ais (план 5.1 «Ничего нового в
 * Prisma», 5.2 «Типы снапшотов, ретенция»): общий конверт SnapshotEnvelope
 * и полезные нагрузки по типам. Здесь только форма данных — без DI,
 * Bitrix и Prisma; раскладка по колонкам ais живёт в приложении
 * (apps/kpi-report-sales/src/ai-analytics/store/snapshot-serialize.util.ts).
 */
import { BucketScore } from '../model/buckets';
import { ManagerTypeCell } from '../model/matrix.types';
import { MetricValue } from '../model/metric';
import { ObjectionCategoryStat } from '../model/objections';
import {
    AiAnalyticsEtlStepStatus,
    AiAnalyticsSnapshotType,
} from './snapshot-kinds.const';
import { AnalysisVersions } from './versions.types';

/**
 * Паспорт менеджера и снимок планов руководителя (поток 14a) объявлены
 * отдельным файлом по лимиту 300 строк, но остаются частью контрактов
 * снапшотов: потребители импортируют их отсюда и из корневого barrel.
 */
export * from './passport.types';

/**
 * Разбор `user_result` чужих записей ais (parseSnapshotPayload,
 * parseSnapshotUserResult, parseSnapshotMeta) объявлен отдельным файлом
 * и по той же причине реэкспортирован отсюда: потребители контрактов
 * снапшотов читают записи через него, а не через свои приведения типов.
 */
export * from './snapshot.parse';

/**
 * Конверт снапшота. Раскладка по ais: domain → domain, type → type,
 * periodKey → activity_id, managerId → user_id, calcVersion → model;
 * paramsVersion, inputsHash, generatedAt и payload едут в user_result.
 * Версии в нагрузках не дублируются — источник истины здесь.
 */
export interface SnapshotEnvelope<T> {
    domain: string;
    type: AiAnalyticsSnapshotType;
    /** Ключ периода по зерну: 'YYYY-MM', 'YYYY-Www', 'YYYY-MM-DD' или хэш. */
    periodKey: string;
    /** Менеджер (зёрна manager-*); null у портальных зёрен. */
    managerId: string | null;
    /** Версия кода расчёта (AI_ANALYTICS_CALC_VERSION приложения). */
    calcVersion: string;
    /** Версия набора параметров модели (ai_analytics_model_params). */
    paramsVersion: string;
    /** Хэш входов расчёта: смена → пересчёт, прошлая запись superseded. */
    inputsHash: string;
    /** Момент формирования, ISO (UTC). */
    generatedAt: string;
    payload: T;
}

/**
 * Версии расчёта в нагрузке снапшота (план §3.1, §10.3 m1): каждая
 * нагрузка Фазы 2 несёт `meta` этой формы. `modelSnapshotId` — id записи
 * `ai-analytics-portal-model`, по которой посчитан период (обязателен
 * для manager-month и forecast, null для самой модели и служебных типов):
 * без него recompute не воспроизводит месяц, посчитанный по прошлой
 * модели. inputsHash и versions в meta не дублируются — хэш входов живёт
 * в конверте (колонка user_result), сигнатура версий разбора — в самой
 * нагрузке (ManagerWeekSnapshot.versions).
 */
export interface AiSnapshotMeta {
    calcVersion: string;
    paramsVersion: string;
    /** Начало сравнимой истории 'YYYY-MM-DD'; null — ряд не рвался. */
    comparableFrom: string | null;
    /** Момент расчёта, ISO (UTC). */
    generatedAt: string;
    /** id модели портала, по которой считался период; null — модели нет. */
    modelSnapshotId: string | null;
}

/**
 * Готовность витрины в снапшоте (структурно совпадает с ReadinessDto
 * приложения): mode — значение AI_ANALYTICS_READINESS_MODES.
 */
export interface SnapshotReadiness {
    mode: string;
    /** Месяцев истории разборов. */
    historyMonths: number;
    /** Разобранных презентаций за окно готовности. */
    presentations: number;
    /** Продаж за окно готовности. */
    sales: number;
    /** Дата сопоставимости версий разбора 'YYYY-MM-DD'; пусто — версий нет. */
    comparableFrom: string;
    reasons: string[];
}

/**
 * Неделя менеджера (тип ai-analytics-manager-week, зерно manager-week):
 * объём и оценки по корзинам и типам звонков, разделы рубрики и чек-листы
 * внутри ячеек типа, срез возражений и версии разбора недели.
 */
export interface ManagerWeekSnapshot {
    /** Разобранных сравнимых звонков за неделю. */
    n: number;
    /** Средняя оценка по звонкам с корзиной, шкала 1–10. */
    score: MetricValue;
    /** Корзины контакт / презентация / закрытие (всегда все три). */
    buckets: BucketScore[];
    /** Ячейки менеджер × тип: разделы, чек-листы, опорные звонки. */
    byType: ManagerTypeCell[];
    /** Возражения недели по категориям (сквозной срез менеджера). */
    objections: ObjectionCategoryStat[];
    /** Сигнатура версий разбора недели; null — разборов без версий. */
    versions: AnalysisVersions | null;
    /** В неделе больше одной сигнатуры версий — ряд разорван. */
    versionsMixed: boolean;
    /** Начало сравнимой истории 'YYYY-MM-DD'; null — не ограничивали. */
    comparableFrom: string | null;
}

/** Факт по типу звонка в месячном снапшоте: объём и средняя оценка. */
export interface ManagerTypeFact {
    callType: string;
    n: number;
    /** Средняя оценка 1–10; value null при «мало данных». */
    score: MetricValue;
}

/** Счётчики ребра воронки за месяц: вошло (n) и сделано (s). */
export interface ManagerEdgeCounts {
    /** Код ребра (AI_ANALYTICS_FUNNEL_EDGES приложения). */
    edge: string;
    /** Вошло в ребро — знаменатель. */
    n: number;
    /** Сделано — числитель (s ≤ n, иначе confidence mixed-sources). */
    s: number;
}

/** Рабочие дни месяца по календарю портала и отсутствиям менеджера. */
export interface ManagerWorkdaysFacts {
    /** Рабочих дней месяца по календарю портала. */
    calendar: number;
    /** Из них отработано менеджером (без отпусков и больничных). */
    worked: number;
    /** Дней отсутствия, вычтенных из плана. */
    absences: number;
}

/** Финансовый хвост месяца менеджера (закрытые сделки и счета). */
export interface ManagerFinanceFacts {
    /** Сумма закрытых продаж, ₽. */
    salesSum: number;
    /** Число закрытых сделок. */
    salesCount: number;
    /** Сумма выставленных счетов, ₽. */
    invoicesSum: number;
    /** Число выставленных счетов. */
    invoicesCount: number;
    /** Средний чек, ₽; null — продаж нет. */
    averageCheck: number | null;
}

/**
 * Месяц менеджера (тип ai-analytics-manager-month, зерно manager-month):
 * KPI-вектор по кодам показателей, факты по типам звонков, рабочие дни,
 * финансы, s/n рёбер воронки и уровень менеджера. calcVersion —
 * в конверте (колонка model), здесь не дублируется.
 */
export interface ManagerMonthSnapshot {
    /** KPI-вектор: код показателя → факт месяца. */
    kpi: Record<string, number>;
    /** Факты по типам звонков в порядке справочника. */
    byType: ManagerTypeFact[];
    workdays: ManagerWorkdaysFacts;
    finance: ManagerFinanceFacts;
    /** Рёбра воронки в порядке справочника рёбер. */
    edges: ManagerEdgeCounts[];
    /** Уровень менеджера (AI_ANALYTICS_MANAGER_LEVELS приложения). */
    level: string;
    /** Источник уровня: назначен РОПом или дефолт по стажу. */
    levelSource: string;
    /** Месяц закрыт и заморожен (пересчёт — только админ-джобой). */
    frozen: boolean;
}

/** Норма портала по ребру воронки: μ, объём и сила приора. */
export interface PortalEdgeNorm {
    /** Код ребра (AI_ANALYTICS_FUNNEL_EDGES приложения). */
    edge: string;
    /** Норма портала μ — доля 0..1. */
    mu: number;
    /** Объём, на котором посчитана норма. */
    n: number;
    /** Псевдонаблюдения приора κ для этого ребра. */
    kappa: number;
}

/**
 * Модель портала за месяц (тип ai-analytics-portal-model, зерно
 * portal-month): нормы рёбер, параметры усадки, потолок плана, медиана
 * цикла и готовность витрины. paramsVersion — в конверте.
 */
export interface PortalModelSnapshot {
    /** Нормы μ по рёбрам воронки. */
    edges: PortalEdgeNorm[];
    /** κ по умолчанию для рёбер без собственной настройки. */
    kappa: number;
    /** m_S — псевдо-n усадки средней оценки звонков. */
    mS: number;
    /** S_ref — опорная оценка портала, шкала 1–10. */
    sRef: number;
    /** Потолок плана — доля от базы (план ≤ базы × cap). */
    cap: number;
    /** Медиана цикла сделки, дней; null — не считается. */
    cycleMedianDays: number | null;
    readiness: SnapshotReadiness;
}

/** Шаг ночного конвейера: длительность, объёмы и ошибка. */
export interface EtlStepResult {
    /** Код шага ('kpi', 'finance', 'calls', 'stage-history', 'model'…). */
    step: string;
    status: AiAnalyticsEtlStepStatus;
    durationMs: number;
    /** Загружено строк источника. */
    rowsLoaded: number;
    /** Вызовов Bitrix REST на шаге. */
    bitrixCalls: number;
    /** Текст ошибки при status = 'failed'; иначе null. */
    error: string | null;
}

/**
 * Прогон ночного конвейера (тип ai-analytics-etl-run, зерно portal-day):
 * шаги с длительностями и вызовами Bitrix, дрейф входов. inputsHash —
 * в конверте: его смена и есть признак дрейфа.
 */
export interface EtlRunSnapshot {
    /** День прогона 'YYYY-MM-DD' в TZ портала (совпадает с periodKey). */
    day: string;
    steps: EtlStepResult[];
    /** Суммарная длительность прогона, мс. */
    durationMs: number;
    /** Суммарно вызовов Bitrix REST за прогон. */
    bitrixCalls: number;
    /** inputsHash отличается от прошлого прогона — входы поехали. */
    inputsDrift: boolean;
}

/**
 * Полезная нагрузка снапшота навыков менеджера: метрики по кодам
 * (раздел рубрики, ребро воронки, доля чек-листа) и версии разбора.
 */
export interface SkillSnapshotPayload {
    versions: AnalysisVersions;
    metrics: Record<string, MetricValue>;
}

/**
 * Заготовка Фазы 2: снапшот навыков менеджера за период (месяц/окно),
 * из которого строятся ряды трендов и досье. Поля сохранены из Фазы 1b;
 * нагрузка вынесена в SkillSnapshotPayload для SnapshotEnvelope.
 */
export interface SkillSnapshot extends SkillSnapshotPayload {
    domain: string;
    managerId: string;
    /** Ключ периода: 'YYYY-MM' или 'YYYY-Www'. */
    periodKey: string;
}
