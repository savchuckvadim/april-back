import {
    PBX_SALES_USER_PLAN_FIELDS,
    type PbxSalesUserPlanFieldCode,
} from '@lib/portal-lib/pbx-domain/field/type/sales/user/pbx-sales-user-plan-field.type';
import type { PortalAppSettingOption } from '../portal-app-settings.schema';

/**
 * Свои названия показателей KPI-отчёта (настройка `report_view_labels`,
 * страница «Настройки отчёта»). Название хранится по КОДУ показателя, а не
 * по исходному названию: переименование ничего не ломает, данные отчёта
 * остаются прежними, своё название подставляется только при показе.
 *
 * Ключ — приставка и код:
 * - `ev:<innerCode>` — колонка событий (`ev:presentation_plan`);
 * - `call:<id бакета>` — колонка звонков (`call:all`, `call:30`);
 * - `plan:<код планового показателя>` — колонка плана (`plan:calls_done`).
 */
export const REPORT_VIEW_LABEL_PREFIXES = {
    event: 'ev',
    calling: 'call',
    plan: 'plan',
} as const;

export type ReportViewLabelPrefix =
    (typeof REPORT_VIEW_LABEL_PREFIXES)[keyof typeof REPORT_VIEW_LABEL_PREFIXES];

/** Ключ своего названия: `<приставка>:<код>`. */
export type ReportViewLabelKey = `${ReportViewLabelPrefix}:${string}`;

/** Свои названия: ключ показателя → название. */
export type ReportViewLabels = Record<string, string>;

/** Пределы: длина названия после обрезки пробелов и число записей. */
export const REPORT_VIEW_LABEL_LIMITS = {
    nameLength: 60,
    entries: 100,
} as const;

/** Шаблон ключа: приставка, двоеточие, строчная латиница, цифры и «_». */
export const REPORT_VIEW_LABEL_KEY_PATTERN = /^(ev|call|plan):[a-z0-9_]+$/;

/** Ключ своего названия по приставке и коду показателя. */
export const reportViewLabelKey = (
    prefix: ReportViewLabelPrefix,
    code: string | number,
): ReportViewLabelKey => `${prefix}:${code}`;

export const isReportViewLabelKey = (
    value: string,
): value is ReportViewLabelKey => REPORT_VIEW_LABEL_KEY_PATTERN.test(value);

/**
 * Название, годное к хранению: строка, пробелы по краям убраны, не пусто и
 * не длиннее предела; иначе null (такую запись не храним).
 */
export function normalizeReportViewLabel(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const name = raw.trim();
    if (name === '' || name.length > REPORT_VIEW_LABEL_LIMITS.nameLength) {
        return null;
    }
    return name;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Чистка набора: ключи только по шаблону, названия — по
 * `normalizeReportViewLabel`; ключи по алфавиту (стабильная запись и
 * сравнение), не больше предела записей.
 */
function cleanReportViewLabels(
    source: Readonly<Record<string, unknown>>,
): ReportViewLabels {
    const entries = Object.keys(source)
        .filter(isReportViewLabelKey)
        .sort()
        .flatMap(key => {
            const name = normalizeReportViewLabel(source[key]);
            return name === null ? [] : [[key, name] as const];
        })
        .slice(0, REPORT_VIEW_LABEL_LIMITS.entries);
    return Object.fromEntries(entries);
}

/**
 * Свои названия из строки настройки (JSON-объект). Пусто, битый JSON или
 * не объект — `{}`. Ключи не по шаблону, нестроковые, пустые и слишком
 * длинные названия отбрасываются; пробелы по краям обрезаются.
 */
export function parseReportViewLabels(raw: unknown): ReportViewLabels {
    if (typeof raw !== 'string' || raw.trim() === '') return {};
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return {};
    }
    return isPlainObject(parsed) ? cleanReportViewLabels(parsed) : {};
}

/**
 * Свои названия → строка настройки: та же чистка, что при чтении, ключи по
 * алфавиту. Пустой набор — пустая строка («свои названия не заданы»).
 */
export function serializeReportViewLabels(
    labels: Readonly<Record<string, unknown>>,
): string {
    const clean = cleanReportViewLabels(labels);
    return Object.keys(clean).length > 0 ? JSON.stringify(clean) : '';
}

/**
 * Плановые показатели, которые можно вывести колонкой в таблице отчёта:
 * только те, чей факт есть в таблицах «События» и «Звонки». Финансы и
 * эфирное время в этих таблицах не показываются — их колонок плана нет.
 * Каталог планов приложения (factSource kpi/calling) обязан совпадать с
 * этим списком — сверяет тест kpi-report-sales.
 */
export const REPORT_VIEW_PLAN_COLUMN_CODES = [
    'calls_done',
    'presentations_done',
    'offers_sent',
    'invoices_sent',
    'sales_count',
    'calls_over_30s',
    'calls_over_60s',
] as const satisfies readonly PbxSalesUserPlanFieldCode[];

export type ReportViewPlanColumnCode =
    (typeof REPORT_VIEW_PLAN_COLUMN_CODES)[number];

export const isReportViewPlanColumnCode = (
    value: string,
): value is ReportViewPlanColumnCode =>
    (REPORT_VIEW_PLAN_COLUMN_CODES as readonly string[]).includes(value);

/** Варианты настройки `report_view_plan_columns_hidden`: код и название плана. */
export const REPORT_VIEW_PLAN_COLUMN_OPTIONS: readonly PortalAppSettingOption[] =
    PBX_SALES_USER_PLAN_FIELDS.filter(field =>
        isReportViewPlanColumnCode(field.code),
    ).map(field => ({ code: field.code, name: field.name }));
