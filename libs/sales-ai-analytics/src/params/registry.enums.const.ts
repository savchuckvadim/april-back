/**
 * Словари значений строковых параметров реестра (`kind: 'enum' | 'csv'`).
 *
 * Живут в `params/`, потому что дескрипторы реестра ссылаются на них как на
 * `enumValues`, а настройки (`settings/ai-settings.types.ts`) — слой выше и
 * только реэкспортируют. Коды Bitrix/PBX сюда не переписываются литералами:
 * стадии и разделы берутся из `@lib/portal-lib`.
 *
 * Чистые константы: без DI, Bitrix и Prisma.
 */
import { EnumSalesKpiOpResultStatus } from '@lib/portal-lib/pbx/pbx-sales-kpi-list/type/pbx-sales-kpi-list.enum';
import type { CallReportCallTypeCode } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import { AI_MANAGER_STATUSES } from '../contracts/passport.types';

export { AI_MANAGER_STATUSES };

/**
 * Уровень менеджера. Он же — метка полосы стажа (`tenure_bands` = 0–6 /
 * 6–18 / 18+ мес.): цели и capacity стратифицируются по стажу, а уровень
 * назначает руководитель. Значения совпадают с
 * `AI_ANALYTICS_MANAGER_LEVELS` приложения — совпадение проверяет спека.
 */
export const AI_MANAGER_LEVELS = ['junior', 'middle', 'senior'] as const;
export type AiManagerLevelCode = (typeof AI_MANAGER_LEVELS)[number];

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
 * Что считать результативным звонком (анкета Ж, `productive_call_definition`):
 * KPI-факт «сделано», статус результата ОП из справочника KPI-списка, порог
 * длительности или дата следующего шага из разбора.
 */
export const AI_PRODUCTIVE_CALL_DEFINITIONS = [
    'kpi_done',
    EnumSalesKpiOpResultStatus.op_call_result_yes,
    'duration_ge',
    'ai_next_step_date',
] as const;
export type AiProductiveCallDefinition =
    (typeof AI_PRODUCTIVE_CALL_DEFINITIONS)[number];

/** Канон презентации: уникальная, любая или только подтверждённая. */
export const AI_PRESENTATION_CANONS = [
    'presentation_uniq_done',
    'presentation_done',
    'confirmed',
] as const;
export type AiPresentationCanon = (typeof AI_PRESENTATION_CANONS)[number];

/** Оцениваемая величина ожидания от пайплайна: cure-форма или CIF. */
export const AI_PIPELINE_ESTIMANDS = ['cure', 'cif'] as const;
export type AiPipelineEstimand = (typeof AI_PIPELINE_ESTIMANDS)[number];

/** Страта лидов менеджера: холодные, заявки, база. */
export const AI_LEAD_MIX_STRATA = ['cold', 'request', 'base'] as const;
export type AiLeadMixStratum = (typeof AI_LEAD_MIX_STRATA)[number];

/**
 * Измерения страт качества базы (`lead_kind_strata`): вид работы с лидом,
 * стадия основной сделки до звонка, тип перспективы, размер компании.
 */
export const AI_LEAD_STRATA_DIMENSIONS = [
    'lead_work_kind',
    'sales_base_stage',
    'prospects_type',
    'company_size',
] as const;
export type AiLeadStrataDimension = (typeof AI_LEAD_STRATA_DIMENSIONS)[number];

/**
 * Уровни доказательности совета (E0 факт … E3 эксперимент). Совпадают с
 * `AI_EVIDENCE_LEVELS` из `model/evidence.ts` — совпадение проверяет спека;
 * модель импортировать сюда нельзя (реестр — нижний слой).
 */
export const AI_EVIDENCE_LEVEL_CODES = ['E0', 'E1', 'E2', 'E3'] as const;
export type AiEvidenceLevelCode = (typeof AI_EVIDENCE_LEVEL_CODES)[number];

/** Продуктовые линейки для пула прайоров (пул только внутри линейки). */
export const AI_PRODUCT_LINES = ['garant_sps'] as const;
export type AiProductLine = (typeof AI_PRODUCT_LINES)[number];

/** Дни недели ISO (1 — понедельник) в виде строк для CSV-значения. */
export const AI_WEEKDAY_CODES = ['1', '2', '3', '4', '5', '6', '7'] as const;
export type AiWeekdayCode = (typeof AI_WEEKDAY_CODES)[number];

/**
 * Типы звонков, у которых есть своя средняя длительность активности
 * (`duration_min_*`) — подмножество справочника типов из portal-lib.
 */
export const AI_DURATION_ACTIVITY_TYPES = [
    'cold',
    'call',
    'presentation',
    'refine',
    'decision',
    'payment',
] as const satisfies readonly CallReportCallTypeCode[];
export type AiDurationActivityType =
    (typeof AI_DURATION_ACTIVITY_TYPES)[number];

/** Типы активностей с дневным потолком полосы стажа (`cap_*`). */
export const AI_CAP_ACTIVITY_TYPES = [
    'cold',
    'call',
    'presentation',
] as const satisfies readonly CallReportCallTypeCode[];
export type AiCapActivityType = (typeof AI_CAP_ACTIVITY_TYPES)[number];

/** Признаки разбора, допустимые как «форма» помимо разделов рубрики. */
export const AI_QUALITY_FORM_FEATURES = [
    'questionsCount',
    'talkRatioPct',
    'nextStep.set',
] as const;
export type AiQualityFormFeature = (typeof AI_QUALITY_FORM_FEATURES)[number];
