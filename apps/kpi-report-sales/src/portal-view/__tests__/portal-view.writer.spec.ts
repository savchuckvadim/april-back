import { NotFoundException } from '@nestjs/common';
import type { PortalService } from '@lib/portal-lib/portal/portal.service';
import {
    EnumPortalAppCode,
    type PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { PortalViewWriter } from '../portal-view.writer';
import { DEFAULT_VIEW, DOMAIN, settingValues } from './portal-view.fixtures';

function build() {
    const appSettings = { save: jest.fn() };
    const portals = { getPortalByDomain: jest.fn() };
    const writer = new PortalViewWriter(
        appSettings as unknown as PortalAppSettingsService,
        portals as unknown as PortalService,
    );
    return { writer, appSettings, portals };
}

const patch = {
    reportViewChartsEnabled: false,
    reportViewUpdatedBy: 'Иванов Пётр',
    reportViewUpdatedAt: '2026-11-25T09:30:00.000Z',
};

describe('PortalViewWriter', () => {
    it('пишет патч в ключи kpi-sales портала и возвращает вид отчёта после записи', async () => {
        const { writer, appSettings, portals } = build();
        portals.getPortalByDomain.mockResolvedValue({ id: 15 });
        appSettings.save.mockResolvedValue(
            settingValues({
                reportViewChartsEnabled: false,
                reportViewUpdatedBy: 'Иванов Пётр',
                reportViewUpdatedAt: '2026-11-25T09:30:00.000Z',
            }),
        );

        const view = await writer.write(DOMAIN, patch);

        expect(portals.getPortalByDomain).toHaveBeenCalledWith(DOMAIN);
        expect(appSettings.save).toHaveBeenCalledWith(
            15,
            EnumPortalAppCode.kpiSales,
            patch,
        );
        expect(view).toEqual({
            ...DEFAULT_VIEW,
            chartsEnabled: false,
            updatedBy: 'Иванов Пётр',
            updatedAt: '2026-11-25T09:30:00.000Z',
        });
    });

    it('портала нет — 404, записи нет', async () => {
        const { writer, appSettings, portals } = build();
        portals.getPortalByDomain.mockResolvedValue(null);

        await expect(writer.write(DOMAIN, patch)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(appSettings.save).not.toHaveBeenCalled();
    });

    it('у портала нет id — тоже 404', async () => {
        const { writer, appSettings, portals } = build();
        portals.getPortalByDomain.mockResolvedValue({});

        await expect(writer.write(DOMAIN, patch)).rejects.toThrow(
            `Портал ${DOMAIN} не найден`,
        );
        expect(appSettings.save).not.toHaveBeenCalled();
    });
});
