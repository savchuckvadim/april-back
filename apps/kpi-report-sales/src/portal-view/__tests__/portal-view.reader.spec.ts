import {
    EnumPortalAppCode,
    type PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { PortalViewReader } from '../portal-view.reader';
import { DEFAULT_VIEW, DOMAIN, settingValues } from './portal-view.fixtures';

function build() {
    const appSettings = { resolve: jest.fn() };
    const reader = new PortalViewReader(
        appSettings as unknown as PortalAppSettingsService,
    );
    return { reader, appSettings };
}

describe('PortalViewReader', () => {
    it('читает ключи kpi-sales домена и разбирает их в вид отчёта', async () => {
        const { reader, appSettings } = build();
        appSettings.resolve.mockResolvedValue(
            settingValues({
                reportViewTabsHidden: 'ai,nope',
                reportViewChartsEnabled: false,
                reportViewBadgesMain: 'signal',
            }),
        );

        const view = await reader.read(DOMAIN);

        expect(appSettings.resolve).toHaveBeenCalledWith(
            DOMAIN,
            EnumPortalAppCode.kpiSales,
        );
        expect(view).toEqual({
            ...DEFAULT_VIEW,
            tabsHidden: ['ai'],
            chartsEnabled: false,
            badgesMain: ['signal'],
        });
    });

    it('badgesMain: заданный список — набором, порядок элементов не теряется', async () => {
        const { reader, appSettings } = build();
        appSettings.resolve.mockResolvedValue(
            settingValues({
                reportViewBadgesMain: 'step_missing,m:pres.dialogue,signal',
            }),
        );

        const badges = await reader.badgesMain(DOMAIN);

        expect(badges).toBeInstanceOf(Set);
        expect([...(badges ?? [])]).toEqual([
            'step_missing',
            'm:pres.dialogue',
            'signal',
        ]);
    });

    it('badgesMain: список пуст (или целиком из неизвестных) — null, действует набор по умолчанию', async () => {
        const { reader, appSettings } = build();

        appSettings.resolve.mockResolvedValue(settingValues());
        expect(await reader.badgesMain(DOMAIN)).toBeNull();

        appSettings.resolve.mockResolvedValue(
            settingValues({ reportViewBadgesMain: 'ghost, ,BAD ID' }),
        );
        expect(await reader.badgesMain(DOMAIN)).toBeNull();
    });

    it('read: свои названия, флаги и скрытые плановые колонки разбираются', async () => {
        const { reader, appSettings } = build();
        appSettings.resolve.mockResolvedValue(
            settingValues({
                reportViewLabels: '{"ev:call_plan":" План звонков "}',
                reportViewPlansMerged: true,
                reportViewPlanColumnsHidden: 'calls_done,ghost',
            }),
        );

        const view = await reader.read(DOMAIN);

        expect(view).toEqual({
            ...DEFAULT_VIEW,
            labels: { 'ev:call_plan': 'План звонков' },
            plansMerged: true,
            planColumnsHidden: ['calls_done'],
        });
    });

    it('labels: свои названия портала; битый JSON — пустой объект', async () => {
        const { reader, appSettings } = build();

        appSettings.resolve.mockResolvedValue(
            settingValues({ reportViewLabels: '{"call:30":"От 30 с"}' }),
        );
        expect(await reader.labels(DOMAIN)).toEqual({ 'call:30': 'От 30 с' });

        appSettings.resolve.mockResolvedValue(
            settingValues({ reportViewLabels: '{"call:30":' }),
        );
        expect(await reader.labels(DOMAIN)).toEqual({});
    });
});
