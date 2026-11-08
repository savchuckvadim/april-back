import { ConfigService } from '@nestjs/config';
import {
    MarketplaceBxClient,
    MarketplaceBxMethod,
} from '../clients/marketplace-bx.client';
import { MarketplacePlacementReader } from '../services/marketplace-placement.reader';

const API = 'https://api.pbx.april-app.ru';

function setup(result: unknown, ok = true) {
    const listPlacements = jest
        .fn()
        .mockResolvedValue(
            ok ? { ok, result } : { ok, error: 'WRONG_AUTH_TYPE' },
        );
    const reader = new MarketplacePlacementReader(
        { listPlacements } as unknown as MarketplaceBxClient,
        { get: () => undefined } as unknown as ConfigService,
    );
    return { reader, listPlacements };
}

describe('MarketplacePlacementReader', () => {
    it('привязки из placement.get: наши — с кодом виджета, чужие — без', async () => {
        const { reader } = setup([
            {
                placement: 'CRM_DEAL_DETAIL_TAB',
                handler: `${API}/api/bitrix-marketplace/placement/event-sales`,
                title: 'Звонки',
            },
            {
                placement: 'CRM_LEAD_DETAIL_TAB',
                handler: 'https://other-app.example/handler',
                title: '',
            },
            { placement: 'BROKEN' },
        ]);
        const live = await reader.fetch('a.bitrix24.ru', 'token');
        expect(live).toEqual({
            ok: true,
            error: null,
            bindings: [
                {
                    placement: 'CRM_DEAL_DETAIL_TAB',
                    handler: `${API}/api/bitrix-marketplace/placement/event-sales`,
                    title: 'Звонки',
                    ours: true,
                    widget: 'event-sales',
                },
                {
                    placement: 'CRM_LEAD_DETAIL_TAB',
                    handler: 'https://other-app.example/handler',
                    title: null,
                    ours: false,
                    widget: null,
                },
            ],
        });
    });

    it('ошибка Битрикса — ok=false с ответом, без привязок', async () => {
        const { reader } = setup(null, false);
        await expect(reader.fetch('a.bitrix24.ru', 'token')).resolves.toEqual({
            ok: false,
            error: 'WRONG_AUTH_TYPE',
            bindings: [],
        });
    });

    it('метод — placement.get (обработчики), а не placement.list (коды мест)', () => {
        expect(MarketplaceBxMethod.PLACEMENT_GET).toBe('placement.get');
    });
});
