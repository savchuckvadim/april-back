import { ConfigService } from '@nestjs/config';
import { MarketplacePlacementSyncService } from '../services/marketplace-placement-sync.service';
import { MarketplaceBxClient } from '../clients/marketplace-bx.client';
import { MarketplaceInstallRepository } from '../persistence/marketplace-install.repository';
import {
    getDesiredBindings,
    MarketplaceProduct,
} from '../config/marketplace-manifest';

type BxMock = jest.Mocked<
    Pick<
        MarketplaceBxClient,
        'listPlacements' | 'bindPlacement' | 'unbindPlacement'
    >
>;
type RepoMock = jest.Mocked<
    Pick<MarketplaceInstallRepository, 'upsertComponents'>
>;

const API = 'https://api.pbx.april-app.ru';
const DESIRED = getDesiredBindings([MarketplaceProduct.SALES]);

describe('MarketplacePlacementSyncService (diff эталон ↔ портал)', () => {
    let service: MarketplacePlacementSyncService;
    let bx: BxMock;
    let repo: RepoMock;

    beforeEach(() => {
        bx = {
            listPlacements: jest
                .fn()
                .mockResolvedValue({ ok: true, result: [] }),
            bindPlacement: jest.fn().mockResolvedValue({ ok: true }),
            unbindPlacement: jest.fn().mockResolvedValue({ ok: true }),
        };
        repo = {
            upsertComponents: jest.fn().mockResolvedValue(undefined),
        };
        const configService = {
            get: jest.fn().mockReturnValue(undefined),
        } as unknown as ConfigService;

        service = new MarketplacePlacementSyncService(
            bx as unknown as MarketplaceBxClient,
            repo as unknown as MarketplaceInstallRepository,
            configService,
        );
    });

    it('пустой портал: биндит все целевые пары «виджет × место»', async () => {
        const result = await service.syncPlacements(
            'portal.bitrix24.ru',
            'at',
            'install-uuid',
            BigInt(1),
        );

        expect(result.bound).toBe(DESIRED.length);
        expect(result.unbound).toBe(0);
        expect(result.errors).toBe(0);
        expect(bx.bindPlacement).toHaveBeenCalledTimes(DESIRED.length);
        // event-sales биндится в ОБА своих места одной и той же HANDLER-URL
        expect(bx.bindPlacement).toHaveBeenCalledWith(
            'portal.bitrix24.ru',
            'at',
            'CRM_DEAL_DETAIL_TAB',
            `${API}/api/bitrix-marketplace/placement/event-sales`,
            'Гарант: Звонки',
            expect.any(String),
        );
        expect(bx.bindPlacement).toHaveBeenCalledWith(
            'portal.bitrix24.ru',
            'at',
            'CRM_COMPANY_DETAIL_TAB',
            `${API}/api/bitrix-marketplace/placement/event-sales`,
            'Гарант: Звонки',
            expect.any(String),
        );
    });

    it('всё уже привязано: идемпотентность — bind не вызывается', async () => {
        bx.listPlacements.mockResolvedValue({
            ok: true,
            result: DESIRED.map(item => ({
                placement: item.place,
                handler: `${API}/api/bitrix-marketplace/placement/${item.widget.code}`,
            })),
        });

        const result = await service.syncPlacements(
            'portal.bitrix24.ru',
            'at',
            'install-uuid',
            BigInt(1),
        );

        expect(result.bound).toBe(0);
        expect(result.unbound).toBe(0);
        expect(bx.bindPlacement).not.toHaveBeenCalled();
        expect(bx.unbindPlacement).not.toHaveBeenCalled();
    });

    it('лишняя НАША привязка (виджет убран из эталона) → unbind + компонент skipped/unbound', async () => {
        bx.listPlacements.mockResolvedValue({
            ok: true,
            result: [
                {
                    placement: 'CRM_LEAD_DETAIL_TAB',
                    handler: `${API}/api/bitrix-marketplace/placement/old-widget`,
                },
            ],
        });

        const result = await service.syncPlacements(
            'portal.bitrix24.ru',
            'at',
            'install-uuid',
            BigInt(1),
        );

        expect(result.unbound).toBe(1);
        expect(bx.unbindPlacement).toHaveBeenCalledWith(
            'portal.bitrix24.ru',
            'at',
            'CRM_LEAD_DETAIL_TAB',
            `${API}/api/bitrix-marketplace/placement/old-widget`,
        );
        expect(repo.upsertComponents).toHaveBeenCalledWith(
            'install-uuid',
            BigInt(1),
            expect.arrayContaining([
                expect.objectContaining({
                    status: 'skipped',
                    reasonCode: 'unbound',
                }),
            ]),
        );
    });

    it('чужой handler не трогается (unbind только наших привязок)', async () => {
        bx.listPlacements.mockResolvedValue({
            ok: true,
            result: [
                {
                    placement: 'CRM_DEAL_DETAIL_TAB',
                    handler: 'https://other-app.example.com/handler',
                },
            ],
        });

        await service.syncPlacements(
            'portal.bitrix24.ru',
            'at',
            'install-uuid',
            BigInt(1),
        );

        expect(bx.unbindPlacement).not.toHaveBeenCalled();
    });

    it('ошибка bind → компонент error + исключение (установка узнает о провале)', async () => {
        bx.bindPlacement.mockResolvedValue({
            ok: false,
            error: 'ERROR',
            errorDescription: 'boom',
        });

        await expect(
            service.syncPlacements(
                'portal.bitrix24.ru',
                'at',
                'install-uuid',
                BigInt(1),
            ),
        ).rejects.toThrow('placement.bind failed');

        expect(repo.upsertComponents).toHaveBeenCalledWith(
            'install-uuid',
            BigInt(1),
            expect.arrayContaining([
                expect.objectContaining({
                    status: 'error',
                    reasonCode: 'bitrix_error',
                }),
            ]),
        );
    });

    it('placement.list недоступен → считаем портал пустым и биндим всё', async () => {
        bx.listPlacements.mockResolvedValue({
            ok: false,
            error: 'expired_token',
        });

        const result = await service.syncPlacements(
            'portal.bitrix24.ru',
            'at',
            'install-uuid',
            BigInt(1),
        );

        expect(result.bound).toBe(DESIRED.length);
    });
});
