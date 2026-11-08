import { marketplace_installs } from 'generated/prisma';
import {
    EnumPortalAppCode,
    getPortalAppDefaults,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { CabinetAppStatusService } from '../cabinet-app-status.service';
import { CabinetPortalRepository } from '../../persistence/cabinet-portal.repository';
import { CabinetPortalRef } from '../../domain/cabinet-context';

const PORTAL: CabinetPortalRef = {
    id: BigInt(12),
    domain: 'a.bitrix24.ru',
    memberId: 'member-1',
    clientId: BigInt(5),
    approvalStatus: null,
};
const DEFAULTS = getPortalAppDefaults(EnumPortalAppCode.portal);

describe('CabinetAppStatusService (приложение April на портале)', () => {
    let portals: jest.Mocked<Pick<CabinetPortalRepository, 'findAppInstall'>>;
    let settings: jest.Mocked<Pick<PortalAppSettingsService, 'resolve'>>;
    let service: CabinetAppStatusService;

    beforeEach(() => {
        portals = { findAppInstall: jest.fn().mockResolvedValue(null) };
        settings = { resolve: jest.fn().mockResolvedValue(DEFAULTS) };
        service = new CabinetAppStatusService(
            portals as unknown as CabinetPortalRepository,
            settings as unknown as PortalAppSettingsService,
        );
    });

    it('не устанавливали: installed=false, режим auto, виджетов нет', async () => {
        await expect(service.status(PORTAL)).resolves.toEqual({
            installed: false,
            installStatus: null,
            installedAt: null,
            uninstalledAt: null,
            bitrixAuthMode: 'auto',
            enabledParts: [],
            widgets: [],
        });
    });

    it('установлено: статус, режим и виджеты из настроек (мусор отброшен)', async () => {
        portals.findAppInstall.mockResolvedValue({
            install_status: 'installed',
            installed_at: new Date('2026-11-08T09:00:00Z'),
            uninstalled_at: null,
        } as marketplace_installs);
        settings.resolve.mockResolvedValue({
            ...DEFAULTS,
            bitrixAuthMode: 'webhook',
            enabledParts: 'sales',
            appWidgets: 'event-sales, bogus, konstructor',
        });

        const status = await service.status(PORTAL);

        expect(status).toMatchObject({
            installed: true,
            installStatus: 'installed',
            installedAt: '2026-11-08T09:00:00.000Z',
            bitrixAuthMode: 'webhook',
            enabledParts: ['sales'],
            widgets: ['event-sales', 'konstructor'],
        });
    });

    it('удалено с портала — installed=false, дата удаления есть', async () => {
        portals.findAppInstall.mockResolvedValue({
            install_status: 'installed',
            installed_at: new Date('2026-11-01T09:00:00Z'),
            uninstalled_at: new Date('2026-11-05T09:00:00Z'),
        } as marketplace_installs);

        const status = await service.status(PORTAL);

        expect(status.installed).toBe(false);
        expect(status.uninstalledAt).toBe('2026-11-05T09:00:00.000Z');
    });
});
