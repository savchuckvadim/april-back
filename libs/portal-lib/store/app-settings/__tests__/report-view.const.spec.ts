import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingDescriptor,
} from '../portal-app-settings.schema';
import {
    hidesEveryCommonReportTab,
    isReportViewTabCode,
    keepCommonReportTabVisible,
    REPORT_VIEW_COMMON_TAB_CODES,
    REPORT_VIEW_COMMON_TAB_NAMES,
    REPORT_VIEW_FALLBACK_TAB_CODE,
    REPORT_VIEW_TABS,
    REPORT_VIEW_TAB_CODES,
} from '../lib/report-view.const';

/**
 * Вкладки вида KPI-отчёта: один список на настройку
 * `report_view_tabs_hidden` и на проверку кода. Скрыть можно любую, но
 * хотя бы одна вкладка из тех, что видят все сотрудники, остаётся видимой.
 */
describe('вкладки вида KPI-отчёта', () => {
    const kpiSales: Record<string, PortalAppSettingDescriptor> =
        PORTAL_APP_SETTINGS_SCHEMA[EnumPortalAppCode.kpiSales];

    it('вкладку «Все» можно скрыть: её код есть в списке', () => {
        expect(REPORT_VIEW_TAB_CODES).toContain('all');
        expect(isReportViewTabCode('all')).toBe(true);
    });

    it('общие вкладки (видят все сотрудники): «Все», «События», «Звонки», «Объединённый отчёт», «Дайджест»', () => {
        expect(REPORT_VIEW_COMMON_TAB_CODES).toEqual([
            'all',
            'events',
            'callings',
            'merged',
            'digest',
        ]);
        expect(REPORT_VIEW_COMMON_TAB_CODES).toContain(
            REPORT_VIEW_FALLBACK_TAB_CODE,
        );
    });

    it('названия общих вкладок для текстов правила — в кавычках через запятую', () => {
        expect(REPORT_VIEW_COMMON_TAB_NAMES).toBe(
            '«Все», «События», «Звонки», «Объединённый отчёт», «Дайджест»',
        );
    });

    it('hidesEveryCommonReportTab: истина, только когда скрыты все пять', () => {
        expect(
            hidesEveryCommonReportTab([
                'merged',
                'ai',
                'digest',
                'callings',
                'events',
                'all',
            ]),
        ).toBe(true);
        expect(
            hidesEveryCommonReportTab(['all', 'events', 'callings', 'merged']),
        ).toBe(false);
        expect(
            hidesEveryCommonReportTab([
                'digest',
                'finance',
                'ai',
                'call_reviews',
            ]),
        ).toBe(false);
        expect(hidesEveryCommonReportTab([])).toBe(false);
    });

    it('keepCommonReportTabVisible: при скрытых всех общих возвращает «Все», иначе список не меняется', () => {
        expect(
            keepCommonReportTabVisible([
                'all',
                'events',
                'callings',
                'merged',
                'digest',
                'ai',
            ]),
        ).toEqual(['events', 'callings', 'merged', 'digest', 'ai']);
        const valid = ['all', 'events', 'ai'];
        expect(keepCommonReportTabVisible(valid)).toEqual(valid);
        expect(keepCommonReportTabVisible(valid)).not.toBe(valid);
        expect(keepCommonReportTabVisible([])).toEqual([]);
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
