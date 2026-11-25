/**
 * Вкладки KPI-отчёта, которые портал может скрыть настройкой
 * `report_view_tabs_hidden` (страница «Настройки отчёта» во фронте
 * kpi-sales). Вкладки «Все» здесь нет намеренно: её скрыть нельзя.
 */
export const REPORT_VIEW_TABS = [
    { code: 'events', name: 'События' },
    { code: 'callings', name: 'Звонки' },
    { code: 'merged', name: 'Объединённый отчёт' },
    { code: 'digest', name: 'Дайджест' },
    { code: 'finance', name: 'Финансы' },
    { code: 'ai', name: 'AI аналитика' },
    { code: 'call_reviews', name: 'Разборы звонков' },
] as const;

export type ReportViewTabCode = (typeof REPORT_VIEW_TABS)[number]['code'];

export const REPORT_VIEW_TAB_CODES: readonly ReportViewTabCode[] =
    REPORT_VIEW_TABS.map(tab => tab.code);

export const isReportViewTabCode = (
    value: string,
): value is ReportViewTabCode =>
    (REPORT_VIEW_TAB_CODES as readonly string[]).includes(value);
