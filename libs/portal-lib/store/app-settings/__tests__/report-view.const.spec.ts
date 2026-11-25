import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingDescriptor,
} from '../portal-app-settings.schema';
import {
    isReportViewTabCode,
    REPORT_VIEW_TABS,
    REPORT_VIEW_TAB_CODES,
} from '../lib/report-view.const';

/**
 * Вкладки вида KPI-отчёта: один список на настройку
 * `report_view_tabs_hidden` и на проверку кода. Вкладка «Все» в списке
 * намеренно нет — скрыть её нельзя.
 */
describe('вкладки вида KPI-отчёта', () => {
    const kpiSales: Record<string, PortalAppSettingDescriptor> =
        PORTAL_APP_SETTINGS_SCHEMA[EnumPortalAppCode.kpiSales];

    it('вкладки «Все» нет: её скрыть нельзя', () => {
        expect(REPORT_VIEW_TAB_CODES).not.toContain('all');
        expect(isReportViewTabCode('all')).toBe(false);
    });

    it('коды уникальны, у каждой вкладки есть название', () => {
        const codes = REPORT_VIEW_TABS.map(tab => tab.code);
        expect(new Set(codes).size).toBe(codes.length);
        for (const tab of REPORT_VIEW_TABS) {
            expect(`${tab.code}:${tab.name.length > 0}`).toBe(
                `${tab.code}:true`,
            );
        }
    });

    it('варианты настройки скрытия совпадают со списком вкладок и это список', () => {
        const descriptor = kpiSales.reportViewTabsHidden;
        expect(descriptor?.code).toBe('report_view_tabs_hidden');
        expect(descriptor?.isList).toBe(true);
        expect(descriptor?.options?.map(option => option.code)).toEqual(
            REPORT_VIEW_TAB_CODES,
        );
    });

    it('isReportViewTabCode принимает только коды вкладок', () => {
        expect(isReportViewTabCode('finance')).toBe(true);
        expect(isReportViewTabCode('call_reviews')).toBe(true);
        expect(isReportViewTabCode('Finance')).toBe(false);
        expect(isReportViewTabCode('')).toBe(false);
    });
});
