import { Logger } from '@nestjs/common';
import type { WsService } from '@/core/ws';
import type { PortalViewReader } from '../../portal-view';
import type { ExcelReportService } from '../../download/services/excel-report.service';
import { ShareLinkPublicController } from '../controllers/share-link-public.controller';
import { EShareLinkStatus } from '../dto/share-link.dto';
import type { ShareLinkService } from '../services/share-link.service';
import type { ShareLinkSnapshotService } from '../services/share-link-snapshot.service';
import type { SharePresenceService } from '../services/share-presence.service';
import { ShareLinkViewReader } from '../services/share-link-view.reader';

const TOKEN = 'tok-1';
const DOMAIN = 'gsr.bitrix24.ru';
const LABELS = { 'ev:presentation_plan': 'Назначенная презентация' };

/** Контроллер публичной ссылки с настоящим читателем названий поверх мока настроек. */
function build(status: EShareLinkStatus = EShareLinkStatus.ACTIVE) {
    const link = {
        id: 'link-1',
        token: TOKEN,
        domain: DOMAIN,
        title: 'Отчёт за ноябрь',
        creatorName: 'Иванов Пётр',
        creatorBxUserId: 447,
        isRefreshable: false,
        refreshIntervalSec: null,
        lastRefreshedAt: null,
        expiresAt: new Date('2026-12-10T00:00:00.000Z'),
        status,
    };
    const service = {
        getPublicByToken: jest.fn().mockResolvedValue(link),
        parseSnapshot: jest.fn().mockReturnValue({
            reportFilters: { dateFrom: '2026-11-01', dateTo: '2026-11-30' },
            ui: { tab: 'events' },
        }),
        registerView: jest.fn().mockResolvedValue(undefined),
    };
    const snapshots = {
        load: jest.fn().mockResolvedValue({
            generatedAt: '2026-11-26T08:00:00.000Z',
            report: [],
            callings: [],
        }),
        generate: jest.fn(),
    };
    const presence = {
        registerUniqueViewer: jest.fn().mockResolvedValue(undefined),
    };
    const portalView = { labels: jest.fn().mockResolvedValue(LABELS) };
    const controller = new ShareLinkPublicController(
        service as unknown as ShareLinkService,
        snapshots as unknown as ShareLinkSnapshotService,
        presence as unknown as SharePresenceService,
        {} as WsService,
        {} as ExcelReportService,
        new ShareLinkViewReader(portalView as unknown as PortalViewReader),
    );
    return { controller, snapshots, portalView };
}

describe('ShareLinkPublicController.getSnapshot: свои названия', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('готовый снимок отдаёт свои названия портала ссылки в view.labels', async () => {
        const { controller, portalView } = build();

        const response = await controller.getSnapshot(TOKEN, '10.0.0.1', '');

        expect(portalView.labels).toHaveBeenCalledWith(DOMAIN);
        expect(response.meta.status).toBe('ready');
        expect(response.view).toEqual({ labels: LABELS });
        expect(response.ui).toEqual({ tab: 'events' });
    });

    it('снимок ещё готовится — названия всё равно приходят', async () => {
        const { controller, snapshots } = build(EShareLinkStatus.PENDING);
        snapshots.load.mockResolvedValue(null);

        const response = await controller.getSnapshot(TOKEN, '10.0.0.1', '');

        expect(response.meta.status).toBe('generating');
        expect(response.view).toEqual({ labels: LABELS });
    });

    it('настройки не прочитались — пустые названия, снимок отдаётся как обычно', async () => {
        const { controller, portalView } = build();
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
        portalView.labels.mockRejectedValue(new Error('база недоступна'));

        const response = await controller.getSnapshot(TOKEN, '10.0.0.1', '');

        expect(response.meta.status).toBe('ready');
        expect(response.view).toEqual({ labels: {} });
    });
});
