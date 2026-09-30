import { NotFoundException } from '@nestjs/common';
import { EnumPortalAppCode } from '@lib/portal-lib/store/app-settings';
import { AiAnalyticsSettingsStore } from '../store/ai-analytics-settings.store';

const DOMAIN = 'april.bitrix24.ru';

/** Стор с моками сервиса настроек и справочника порталов. */
function makeStore(portal: { id?: number } | null = { id: 42 }) {
    const appSettings = { save: jest.fn().mockResolvedValue({}) };
    const portals = { getPortalByDomain: jest.fn().mockResolvedValue(portal) };
    return {
        store: new AiAnalyticsSettingsStore(
            {} as never,
            appSettings as never,
            portals as never,
        ),
        appSettings,
        portals,
    };
}

describe('AiAnalyticsSettingsStore.savePool — согласие на пул порталов', () => {
    it('включение пишет флаг и дату согласия в ключи схемы [kpiSales] одной записью', async () => {
        const { store, appSettings, portals } = makeStore();

        await store.savePool(DOMAIN, {
            optIn: true,
            consentAt: '2026-09-29',
        });

        expect(portals.getPortalByDomain).toHaveBeenCalledWith(DOMAIN);
        expect(appSettings.save).toHaveBeenCalledTimes(1);
        expect(appSettings.save).toHaveBeenCalledWith(
            42,
            EnumPortalAppCode.kpiSales,
            {
                aiAnalyticsPoolOptIn: true,
                aiAnalyticsPoolConsentAt: '2026-09-29',
            },
        );
    });

    it('отзыв согласия — флаг false и пустая дата (решение снято явно)', async () => {
        const { store, appSettings } = makeStore();

        await store.savePool(DOMAIN, { optIn: false, consentAt: '' });

        expect(appSettings.save).toHaveBeenCalledWith(
            42,
            EnumPortalAppCode.kpiSales,
            { aiAnalyticsPoolOptIn: false, aiAnalyticsPoolConsentAt: '' },
        );
    });

    it('портала нет — 404, в настройки ничего не пишется', async () => {
        const { store, appSettings } = makeStore(null);

        await expect(
            store.savePool(DOMAIN, { optIn: true, consentAt: '2026-09-29' }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(appSettings.save).not.toHaveBeenCalled();
    });
});
