import { ConfigService } from '@nestjs/config';
import { MarketplaceEventSyncService } from '../services/marketplace-event-sync.service';
import { MarketplaceBxClient } from '../clients/marketplace-bx.client';
import { MARKETPLACE_LIFECYCLE_EVENTS } from '../config/marketplace-manifest';

type BxMock = jest.Mocked<
    Pick<MarketplaceBxClient, 'bindEvent' | 'unbindEvent' | 'listEvents'>
>;

const DOMAIN = 'portal.bitrix24.ru';
const TOKEN = 'access-token';
const HANDLER = 'https://api.pbx.april-app.ru/api/bitrix-marketplace/event';

describe('MarketplaceEventSyncService (diff-синхронизация событий)', () => {
    let service: MarketplaceEventSyncService;
    let bx: BxMock;

    beforeEach(() => {
        bx = {
            bindEvent: jest.fn().mockResolvedValue({ ok: true }),
            unbindEvent: jest.fn().mockResolvedValue({ ok: true }),
            listEvents: jest.fn().mockResolvedValue({ ok: true, result: [] }),
        };
        const configService = {
            get: jest.fn().mockReturnValue(undefined),
        } as unknown as ConfigService;
        service = new MarketplaceEventSyncService(
            bx as unknown as MarketplaceBxClient,
            configService,
        );
    });

    it('пустой портал: биндит все lifecycle-события', async () => {
        const result = await service.syncEvents(DOMAIN, TOKEN);

        expect(bx.bindEvent).toHaveBeenCalledTimes(
            MARKETPLACE_LIFECYCLE_EVENTS.length,
        );
        expect(bx.bindEvent).toHaveBeenCalledWith(
            DOMAIN,
            TOKEN,
            'ONAPPUNINSTALL',
            HANDLER,
        );
        expect(result).toEqual({
            bound: MARKETPLACE_LIFECYCLE_EVENTS.length,
            unbound: 0,
            errors: 0,
            total: MARKETPLACE_LIFECYCLE_EVENTS.length,
        });
    });

    it('переустановка: все уже привязаны → ноль вызовов bind (главный сценарий фикса)', async () => {
        bx.listEvents.mockResolvedValue({
            ok: true,
            result: MARKETPLACE_LIFECYCLE_EVENTS.map(event => ({
                event,
                handler: HANDLER,
            })),
        });

        const result = await service.syncEvents(DOMAIN, TOKEN);

        expect(bx.bindEvent).not.toHaveBeenCalled();
        expect(bx.unbindEvent).not.toHaveBeenCalled();
        expect(result.bound).toBe(0);
        expect(result.errors).toBe(0);
    });

    it('частично привязано: биндит только недостающие', async () => {
        bx.listEvents.mockResolvedValue({
            ok: true,
            result: [{ event: 'ONAPPUNINSTALL', handler: HANDLER }],
        });

        const result = await service.syncEvents(DOMAIN, TOKEN);

        expect(bx.bindEvent).toHaveBeenCalledTimes(
            MARKETPLACE_LIFECYCLE_EVENTS.length - 1,
        );
        expect(bx.bindEvent).not.toHaveBeenCalledWith(
            DOMAIN,
            TOKEN,
            'ONAPPUNINSTALL',
            HANDLER,
        );
        expect(result.bound).toBe(MARKETPLACE_LIFECYCLE_EVENTS.length - 1);
    });

    it('регистронезависимость: событие в нижнем регистре считается привязанным', async () => {
        bx.listEvents.mockResolvedValue({
            ok: true,
            result: [{ event: 'onappuninstall', handler: HANDLER }],
        });

        await service.syncEvents(DOMAIN, TOKEN);

        expect(bx.bindEvent).not.toHaveBeenCalledWith(
            DOMAIN,
            TOKEN,
            'ONAPPUNINSTALL',
            HANDLER,
        );
    });

    it('устаревший НАШ handler отвязывается, чужой не трогается', async () => {
        const staleOurs =
            'https://old.pbx.april-app.ru/api/bitrix-marketplace/event';
        const foreign = 'https://someone-else.example.com/handler';
        bx.listEvents.mockResolvedValue({
            ok: true,
            result: [
                { event: 'ONAPPUNINSTALL', handler: HANDLER },
                { event: 'ONAPPUPDATE', handler: staleOurs },
                { event: 'ONAPPPAYMENT', handler: foreign },
            ],
        });

        const result = await service.syncEvents(DOMAIN, TOKEN);

        expect(bx.unbindEvent).toHaveBeenCalledTimes(1);
        expect(bx.unbindEvent).toHaveBeenCalledWith(
            DOMAIN,
            TOKEN,
            'ONAPPUPDATE',
            staleOurs,
        );
        expect(result.unbound).toBe(1);
    });

    it('event.get упал: fallback — биндит все (без throw)', async () => {
        bx.listEvents.mockResolvedValue({ ok: false, error: 'expired_token' });

        const result = await service.syncEvents(DOMAIN, TOKEN);

        expect(bx.bindEvent).toHaveBeenCalledTimes(
            MARKETPLACE_LIFECYCLE_EVENTS.length,
        );
        expect(result.bound).toBe(MARKETPLACE_LIFECYCLE_EVENTS.length);
    });

    it('ошибка bind одного события → throw с именем события', async () => {
        bx.bindEvent.mockImplementation((_d, _t, event) =>
            Promise.resolve(
                event === 'ONAPPUPDATE'
                    ? { ok: false, error: 'ERROR_CORE' }
                    : { ok: true },
            ),
        );

        await expect(service.syncEvents(DOMAIN, TOKEN)).rejects.toThrow(
            /event\.bind failed: .*ONAPPUPDATE/,
        );
    });

    it('ошибка unbind не фатальна (warn, результат с errors)', async () => {
        const staleOurs =
            'https://old.pbx.april-app.ru/api/bitrix-marketplace/event';
        bx.listEvents.mockResolvedValue({
            ok: true,
            result: [
                ...MARKETPLACE_LIFECYCLE_EVENTS.map(event => ({
                    event,
                    handler: HANDLER,
                })),
                { event: 'ONAPPUNINSTALL', handler: staleOurs },
            ],
        });
        bx.unbindEvent.mockResolvedValue({ ok: false, error: 'ERR' });

        const result = await service.syncEvents(DOMAIN, TOKEN);

        expect(result.errors).toBe(1);
        expect(result.unbound).toBe(0);
    });

    it('env MARKETPLACE_API_PUBLIC_URL подменяет базу handler-URL', () => {
        const configService = {
            get: jest.fn().mockReturnValue('https://custom.example.com'),
        } as unknown as ConfigService;
        const custom = new MarketplaceEventSyncService(
            bx as unknown as MarketplaceBxClient,
            configService,
        );

        expect(custom.handlerUrl()).toBe(
            'https://custom.example.com/api/bitrix-marketplace/event',
        );
    });
});
