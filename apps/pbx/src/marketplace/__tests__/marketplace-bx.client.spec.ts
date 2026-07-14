import axios from 'axios';
import {
    MarketplaceBxClient,
    MarketplaceBxMethod,
} from '../clients/marketplace-bx.client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const DOMAIN = 'portal.bitrix24.ru';
const TOKEN = 'access-token';

/** Реальный ответ Битрикса на повторный event.bind (прод-лог 2026-07-13) */
const ALREADY_BINDED_CORE = {
    error: 'ERROR_CORE',
    error_description: 'Unable to set event handler: Handler already binded',
};

describe('MarketplaceBxClient (идемпотентность «уже сделано»)', () => {
    let client: MarketplaceBxClient;

    beforeEach(() => {
        jest.resetAllMocks();
        mockedAxios.isAxiosError.mockImplementation(
            (error: unknown) =>
                typeof error === 'object' &&
                error !== null &&
                'response' in error,
        );
        client = new MarketplaceBxClient();
    });

    it('ERROR_CORE + «Handler already binded» со статусом 200 → успех (регресс прод-бага)', async () => {
        mockedAxios.post.mockResolvedValue({ data: ALREADY_BINDED_CORE });

        const result = await client.bindEvent(
            DOMAIN,
            TOKEN,
            'ONAPPUNINSTALL',
            'https://api/handler',
        );

        expect(result).toEqual({ ok: true, result: 'already_done' });
    });

    it('ERROR_CORE + «Handler already binded» с HTTP 4xx → успех', async () => {
        mockedAxios.post.mockRejectedValue({
            response: { data: ALREADY_BINDED_CORE },
        });

        const result = await client.bindEvent(
            DOMAIN,
            TOKEN,
            'ONAPPUNINSTALL',
            'https://api/handler',
        );

        expect(result).toEqual({ ok: true, result: 'already_done' });
    });

    it.each([
        'ERROR_HANDLER_ALREADY_EXIST',
        'ERROR_PLACEMENT_HANDLER_ALREADY_EXIST',
    ])('специфичный код %s → успех в обеих ветках', async code => {
        mockedAxios.post.mockResolvedValueOnce({ data: { error: code } });
        const on200 = await client.bindPlacement(
            DOMAIN,
            TOKEN,
            'CRM_DEAL_DETAIL_TAB',
            'https://api/handler',
            'Виджет',
        );
        expect(on200.ok).toBe(true);

        mockedAxios.post.mockRejectedValueOnce({
            response: { data: { error: code } },
        });
        const on4xx = await client.bindPlacement(
            DOMAIN,
            TOKEN,
            'CRM_DEAL_DETAIL_TAB',
            'https://api/handler',
            'Виджет',
        );
        expect(on4xx.ok).toBe(true);
    });

    it('ERROR_CORE с посторонним описанием НЕ считается успехом', async () => {
        mockedAxios.post.mockResolvedValue({
            data: {
                error: 'ERROR_CORE',
                error_description: 'Application not found',
            },
        });

        const result = await client.bindEvent(
            DOMAIN,
            TOKEN,
            'ONAPPUNINSTALL',
            'https://api/handler',
        );

        expect(result.ok).toBe(false);
        expect(result.error).toBe('ERROR_CORE');
        expect(result.errorDescription).toBe('Application not found');
    });

    it('успешный вызов возвращает result', async () => {
        mockedAxios.post.mockResolvedValue({
            data: { result: [{ event: 'ONAPPUNINSTALL' }] },
        });

        const result = await client.listEvents(DOMAIN, TOKEN);

        expect(result.ok).toBe(true);
        expect(result.result).toEqual([{ event: 'ONAPPUNINSTALL' }]);
        expect(mockedAxios.post.mock.calls[0]).toEqual([
            `https://${DOMAIN}/rest/${MarketplaceBxMethod.EVENT_GET}`,
            { auth: TOKEN },
            expect.any(Object),
        ]);
    });

    it('сетевая ошибка → NETWORK_ERROR', async () => {
        mockedAxios.post.mockRejectedValue(new Error('socket hang up'));

        const result = await client.unbindEvent(
            DOMAIN,
            TOKEN,
            'ONAPPUNINSTALL',
            'https://api/handler',
        );

        expect(result.ok).toBe(false);
        expect(result.error).toBe('NETWORK_ERROR');
        expect(result.errorDescription).toBe('socket hang up');
    });
});
