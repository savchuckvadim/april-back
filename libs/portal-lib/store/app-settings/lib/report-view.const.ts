/**
 * Вкладки KPI-отчёта, которые портал может скрыть настройкой
 * `report_view_tabs_hidden` (страница «Настройки отчёта» во фронте
 * kpi-sales). `common` — вкладку видят все сотрудники портала; остальные
 * («Финансы», «AI аналитика», «Разборы звонков») показываются по правам.
 * Хотя бы одна общая вкладка должна оставаться видимой, иначе у сотрудника
 * без особых прав не останется ни одной. Признак повторяет правила фронта
 * kpi-sales (shared/access/access.rules.ts, use-available-report-types.ts):
 * меняются права на вкладку там — поправить и здесь.
 */
export const REPORT_VIEW_TABS = [
    { code: 'all', name: 'Все', common: true },
    { code: 'events', name: 'События', common: true },
    { code: 'callings', name: 'Звонки', common: true },
    { code: 'merged', name: 'Объединённый отчёт', common: true },
    { code: 'digest', name: 'Дайджест', common: true },
    { code: 'finance', name: 'Финансы', common: false },
    { code: 'ai', name: 'AI аналитика', common: false },
    { code: 'call_reviews', name: 'Разборы звонков', common: false },
] as const;

export type ReportViewTabCode = (typeof REPORT_VIEW_TABS)[number]['code'];

export const REPORT_VIEW_TAB_CODES: readonly ReportViewTabCode[] =
    REPORT_VIEW_TABS.map(tab => tab.code);

/** Общие вкладки (их видят все сотрудники): хотя бы одна остаётся видимой. */
export const REPORT_VIEW_COMMON_TAB_CODES: readonly ReportViewTabCode[] =
    REPORT_VIEW_TABS.filter(tab => tab.common).map(tab => tab.code);

/**
 * Названия общих вкладок в кавычках через запятую — для текстов правила
 * (описания ручек и настройки, сообщение об отказе): меняется признак
 * `common` — тексты меняются сами.
 */
export const REPORT_VIEW_COMMON_TAB_NAMES: string = REPORT_VIEW_TABS.filter(
    tab => tab.common,
)
    .map(tab => `«${tab.name}»`)
    .join(', ');

/** Вкладка, которая остаётся видимой, если в настройке скрыты все общие. */
export const REPORT_VIEW_FALLBACK_TAB_CODE: ReportViewTabCode = 'all';

export const isReportViewTabCode = (
    value: string,
): value is ReportViewTabCode =>
    (REPORT_VIEW_TAB_CODES as readonly string[]).includes(value);

/** Скрыты все общие вкладки — такой набор недопустим. */
export const hidesEveryCommonReportTab = (hidden: readonly string[]): boolean =>
    REPORT_VIEW_COMMON_TAB_CODES.every(code => hidden.includes(code));

/**
 * Страховка чтения: настройку можно поправить и в админке, мимо проверки
 * страницы «Настройки отчёта». Если в ней скрыты все общие вкладки, «Все»
 * остаётся видимой; иначе список возвращается как есть.
 */
export const keepCommonReportTabVisible = <T extends string>(
    hidden: readonly T[],
): T[] =>
    hidesEveryCommonReportTab(hidden)
        ? hidden.filter(code => code !== REPORT_VIEW_FALLBACK_TAB_CODE)
        : [...hidden];
