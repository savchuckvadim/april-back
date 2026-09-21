import axios from 'axios';
import { BitrixProfileClient } from '../bitrix-profile.client';
import { BITRIX_PROFILE_TIMEOUT_MS } from '../portal-session.const';

jest.mock('axios', () => ({
    __esModule: true,
    default: {
        post: jest.fn(),
        isAxiosError: (error: unknown): boolean =>
            typeof error === 'object' &&
            error !== null &&
            'isAxiosError' in error,
    },
}));

const { post } = axios as unknown as { post: jest.Mock };

describe('BitrixProfileClient', () => {
    const client = new BitrixProfileClient();

    beforeEach(() => post.mockReset());

    it('живой токен → профиль: id, имя, фамилия, признак администратора', async () => {
        post.mockResolvedValue({
            data: {
                result: {
                    ID: 447,
                    NAME: 'Иван',
                    LAST_NAME: 'Петров',
                    ADMIN: true,
                },
            },
        });

        const result = await client.getProfile('april.bitrix24.ru', 'tok');

        expect(result).toEqual({
            ok: true,
            profile: {
                id: '447',
                name: 'Иван',
                lastName: 'Петров',
                isAdmin: true,
            },
        });
        expect(post).toHaveBeenCalledWith(
            'https://april.bitrix24.ru/rest/profile',
            { auth: 'tok' },
            { timeout: BITRIX_PROFILE_TIMEOUT_MS },
        );
    });

    it('ADMIN строкой "true" и пустые имена → isAdmin true, имена null', async () => {
        post.mockResolvedValue({
            data: { result: { ID: '7', NAME: '', ADMIN: 'true' } },
        });

        const result = await client.getProfile('april.bitrix24.ru', 'tok');

        expect(result).toEqual({
            ok: true,
            profile: { id: '7', name: null, lastName: null, isAdmin: true },
        });
    });

    it('REST-ошибка в теле 200 → ok=false с кодом Битрикса', async () => {
        post.mockResolvedValue({
            data: { error: 'expired_token', error_description: 'expired' },
        });

        await expect(
            client.getProfile('april.bitrix24.ru', 'tok'),
        ).resolves.toEqual({ ok: false, error: 'expired_token' });
    });

    it('HTTP 401 с телом Битрикса → код ошибки из тела, не NETWORK_ERROR', async () => {
        post.mockRejectedValue({
            isAxiosError: true,
            response: { status: 401, data: { error: 'invalid_token' } },
        });

        await expect(
            client.getProfile('april.bitrix24.ru', 'tok'),
        ).resolves.toEqual({ ok: false, error: 'invalid_token' });
    });

    it('сетевая ошибка → NETWORK_ERROR с текстом', async () => {
        post.mockRejectedValue(new Error('ECONNRESET'));

        await expect(
            client.getProfile('april.bitrix24.ru', 'tok'),
        ).resolves.toEqual({ ok: false, error: 'NETWORK_ERROR: ECONNRESET' });
    });

    it('ответ без ID пользователя → NO_USER_ID; пустой result → EMPTY_RESULT', async () => {
        post.mockResolvedValueOnce({ data: { result: { NAME: 'Без id' } } });
        await expect(
            client.getProfile('april.bitrix24.ru', 'tok'),
        ).resolves.toEqual({ ok: false, error: 'NO_USER_ID' });

        post.mockResolvedValueOnce({ data: {} });
        await expect(
            client.getProfile('april.bitrix24.ru', 'tok'),
        ).resolves.toEqual({ ok: false, error: 'EMPTY_RESULT' });
    });
});
