/**
 * Типы настроек портала AI-аналитики ОП (план Фазы 2, §3.3): десять ключей
 * `[kpiSales]` схемы app-settings, каждый — JSON-строка либо скаляр-строка.
 *
 * Правило раздела 4.1 плана: **настройками бывают только решения людей** —
 * уровни, цели, отсутствия, определения событий, журнал, потолки
 * оценивания, гипотеза качества и подтверждение ростера. Всё, что можно
 * оценить из данных (нормы, κ, β, цикл, capacity), настройкой не бывает и
 * живёт в реестре параметров `params/` со слоями.
 *
 * Чистые типы: без DI, Bitrix и Prisma; значения — примитивы и их массивы.
 */
import { CALL_REPORT_CALL_TYPE_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import type { CallReportCallTypeCode } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import type { CallReportSectionCode } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import type { PbxDealSalesBaseStageCode } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import type { AiAnalyticsParamCode } from '../params/registry.const';
import type { ParamPrimitive } from '../params/registry.types';

/** Ключи настроек Фазы 2 в схеме `[kpiSales]` (snake_case-коды JSON). */
export const AI_SETTINGS_KEYS = {
    levels: 'ai_analytics_levels',
    targets: 'ai_analytics_targets',
    absences: 'ai_analytics_absences',
    modelParams: 'ai_analytics_model_params',
    managerParams: 'ai_analytics_manager_params',
    definitions: 'ai_analytics_definitions',
    events: 'ai_analytics_events',
    scoring: 'ai_analytics_scoring',
    hypothesis: 'ai_analytics_hypothesis',
    rosterConfirmedAt: 'ai_analytics_roster_confirmed_at',
} as const;

export const AI_SETTINGS_KEY_CODES = Object.values(AI_SETTINGS_KEYS);
export type AiSettingsKeyName = keyof typeof AI_SETTINGS_KEYS;
export type AiSettingsKeyCode = (typeof AI_SETTINGS_KEYS)[AiSettingsKeyName];

/** Сырые значения десяти ключей (то, что лежит в JSON портала). */
export type AiSettingsRaw = Readonly<Record<AiSettingsKeyName, string>>;

// ---------------------------------------------------------------------------
// Уровни и полосы стажа
// ---------------------------------------------------------------------------

/**
 * Уровень менеджера. Он же — метка полосы стажа (`tenure_bands` = 0–6 /
 * 6–18 / 18+ мес.): цели и capacity стратифицируются по стажу, а уровень
 * назначает руководитель. Значения совпадают с
 * `AI_ANALYTICS_MANAGER_LEVELS` приложения — совпадение проверяет спека.
 */
export const AI_MANAGER_LEVELS = ['junior', 'middle', 'senior'] as const;
export type AiManagerLevelCode = (typeof AI_MANAGER_LEVELS)[number];

/** Откуда взят уровень: назначен руководителем или подсказан по стажу. */
export const AI_LEVEL_SOURCES = ['manual', 'default'] as const;
export type AiLevelSource = (typeof AI_LEVEL_SOURCES)[number];

/** Запись ключа `ai_analytics_levels`. */
export interface AiManagerLevelSetting {
    managerId: number;
    level: AiManagerLevelCode;
    /** Начало стажа YYYY-MM-DD; null — не задано (берётся паспорт менеджера). */
    since: string | null;
    source: AiLevelSource;
}

// ---------------------------------------------------------------------------
// Цели и отсутствия
// ---------------------------------------------------------------------------

/** Цель уровня: продажи в месяц, минимум презентаций, холодных в день. */
export interface AiLevelTarget {
    /** Продаж в месяц; null — считать медианой полосы стажа за 3 месяца. */
    sales: number | null;
    /** Обучающий минимум презентаций в месяц (`training_min_presentations`). */
    presentationsMin: number;
    /** Дневной минимум холодных звонков (`cap_cold` как ориентир). */
    coldPerDay: number;
}

/** Ключ `ai_analytics_targets`: цели по уровням + личные переопределения. */
export interface AiTargets {
    byLevel: Readonly<Record<AiManagerLevelCode, AiLevelTarget>>;
    /** managerId → личная цель продаж; null — переопределение снято. */
    overrides: Readonly<Record<string, number | null>>;
}

/** Вид отсутствия менеджера. */
export const AI_ABSENCE_KINDS = [
    'vacation',
    'sick',
    'training',
    'other',
] as const;
export type AiAbsenceKind = (typeof AI_ABSENCE_KINDS)[number];

/** Отрезок отсутствия (включительно с обеих сторон). */
export interface AiAbsence {
    from: string;
    to: string;
    kind: AiAbsenceKind;
}

/** Ключ `ai_analytics_absences`: managerId → отрезки. */
export type AiAbsencesByManager = Readonly<
    Record<string, readonly AiAbsence[]>
>;

// ---------------------------------------------------------------------------
// Параметры модели и менеджеров
// ---------------------------------------------------------------------------

/** Ключ `ai_analytics_model_params`: коды реестра → примитив. */
export type AiModelParams = Readonly<
    Partial<Record<AiAnalyticsParamCode, ParamPrimitive>>
>;

/** Слой менеджера ключа `ai_analytics_manager_params`. */
export interface AiManagerParams {
    /** Ставка [0.25; 1]: половина ставки — половина экспозиции. */
    fteShare?: number;
    absences?: readonly AiAbsence[];
    /** Личная цель продаж; null — снять переопределение. */
    targetOverride?: number | null;
    trainingMinPresentations?: number;
    /** Исключить из норм отдела (стажёр, наставник, особый профиль). */
    excludeFromNorms?: boolean;
    alertsMuted?: boolean;
    digestEnabled?: boolean;
    mentorUserId?: number;
    /** Свой рабочий календарь: дни недели 1–7 и TZ. */
    workweek?: readonly number[];
    timeZone?: string;
}

export type AiManagerParamsByManager = Readonly<
    Record<string, AiManagerParams>
>;

// ---------------------------------------------------------------------------
// Определения событий портала
// ---------------------------------------------------------------------------

/** Слой, по которому стратифицируются нормы (решение админа). */
export const AI_NORM_STRATA = ['tenure', 'level'] as const;
export type AiNormStratum = (typeof AI_NORM_STRATA)[number];

/** Вложенность счетов относительно КП. */
export const AI_INVOICE_NESTINGS = ['disjoint', 'nested'] as const;
export type AiInvoiceNesting = (typeof AI_INVOICE_NESTINGS)[number];

/** Цвет компании («ОП Прогноз работы»); none — не установлен. */
export const AI_HOT_CLIENT_COLORS = ['green', 'yellow', 'red', 'none'] as const;
export type AiHotClientColor = (typeof AI_HOT_CLIENT_COLORS)[number];

/**
 * Рёбра воронки (канон §2.3 плана): E1 звонок → презентация, E2 → КП,
 * E3 → счёт после презентации, E3′ звонок → счёт без презентации,
 * E4 счёт → продажа, E5 презентация → продажа. Совпадает с `AI_EDGE_CODES`
 * потока реестра — после его слияния список импортируется оттуда.
 */
export const AI_FUNNEL_EDGE_CODES = [
    'e1',
    'e2',
    'e3',
    'e3_prime',
    'e4',
    'e5',
] as const;
export type AiFunnelEdgeCode = (typeof AI_FUNNEL_EDGE_CODES)[number];

/** Порог длительности разбираемого звонка по типу, секунды. */
export type AiMinDurationByType = Readonly<
    Record<CallReportCallTypeCode, number>
>;

/** Ключ `ai_analytics_definitions`. */
export interface AiPortalDefinitions {
    /** Что считать продуктивным звонком (kpi_done / ai_next_step_date). */
    productiveCall: string;
    /** Канон презентации (presentation_uniq_done и т.п.). */
    presentationCanon: string;
    /** Считать только подтверждённые презентации. */
    confirmedOnly: boolean;
    /** Правило «горячего» клиента: `stage_from:<код стадии>`. */
    hotClient: string;
    /** Стадия-порог «горячего» из лестницы sales_base. */
    hotStageCode: PbxDealSalesBaseStageCode;
    minDurationSecByType: AiMinDurationByType;
    invoiceNesting: AiInvoiceNesting;
    /** Считать ли звонок с сайта частью call_done. */
    callDoneIncludesSiteComeCall: boolean;
    decisionStages: readonly PbxDealSalesBaseStageCode[];
    funnelEdges: readonly AiFunnelEdgeCode[];
    normStratum: AiNormStratum;
    hotClientColors: readonly AiHotClientColor[];
}

// ---------------------------------------------------------------------------
// Журнал событий, потолки оценивания, гипотеза
// ---------------------------------------------------------------------------

/**
 * Виды событий портала: приход новичка, смена рубрики, скрипта, цены и
 * автособытие «сменили определение» (его пишет сохранение настроек с
 * `breaksSeries`), плюс произвольная ручная отметка.
 */
export const AI_PORTAL_EVENT_KINDS = [
    'new_hire',
    'rubric_change',
    'script_change',
    'price_change',
    'settings_break',
    'manual',
] as const;
export type AiPortalEventKind = (typeof AI_PORTAL_EVENT_KINDS)[number];

/** Источник записи журнала. */
export const AI_PORTAL_EVENT_SOURCES = ['manual', 'auto'] as const;
export type AiPortalEventSource = (typeof AI_PORTAL_EVENT_SOURCES)[number];

/** Запись ключа `ai_analytics_events`. */
export interface AiPortalEvent {
    date: string;
    kind: AiPortalEventKind;
    note?: string;
    source: AiPortalEventSource;
}

/** Правило потолка оценки (ключ `ai_analytics_scoring`, часть `caps`). */
export interface AiScoringCapRule {
    ruleCode: string;
    /** Условие по-человечески: «nextStep.set = false». */
    condition: string;
    section: CallReportSectionCode;
    /** Потолок балла раздела при срабатывании, 1–9. */
    maxScore: number;
    /** Флаг разбора, который выставляется вместе с потолком. */
    flag: string;
}

/** Ключ `ai_analytics_scoring`. */
export interface AiScoringSettings {
    caps: readonly AiScoringCapRule[];
    stopWords: readonly string[];
}

/** Пара гипотезы «при качестве s нужно n презентаций». */
export interface AiHypothesisPair {
    s: number;
    n: number;
}

/** Ключ `ai_analytics_hypothesis`; null — гипотеза не задана. */
export interface AiQualityHypothesis {
    pairs: readonly AiHypothesisPair[];
    since: string;
    author: string;
}

/** Все десять блоков в разобранном виде. */
export interface AiPortalSettingsBlocks {
    levels: readonly AiManagerLevelSetting[];
    targets: AiTargets;
    absences: AiAbsencesByManager;
    modelParams: AiModelParams;
    managerParams: AiManagerParamsByManager;
    definitions: AiPortalDefinitions;
    events: readonly AiPortalEvent[];
    scoring: AiScoringSettings;
    hypothesis: AiQualityHypothesis | null;
    /** Дата подтверждения ростера YYYY-MM-DD; '' — не подтверждён. */
    rosterConfirmedAt: string;
}

/** Ограничения объёма из §3.3 плана — их же проверяет сохранение. */
export const AI_SETTINGS_LIMITS = {
    capsMax: 20,
    capMaxScore: [1, 9] as const,
    stopWordsMax: 100,
    hypothesisPairsMin: 2,
    hypothesisScore: [3, 10] as const,
    fteShare: [0.25, 1] as const,
    targetSales: [0, 50] as const,
    presentationsMin: [0, 60] as const,
    coldPerDay: [0, 200] as const,
    absenceHorizonDays: 90,
    levelsMax: 500,
    eventsMax: 200,
} as const;

/** Типы звонков, для которых задаётся порог длительности. */
export const AI_DURATION_CALL_TYPES = CALL_REPORT_CALL_TYPE_CODES;
