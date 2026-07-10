import { AxiosInstance } from 'axios';
import { BitrixV3CoreService } from '../base/bitrix-v3-core.service';
import { BitrixV3ApiError } from '../base/bitrix-v3-api.error';
import { IBitrixV3Credentials } from '../interface/bitrix-v3-credentials.interface';

const credentials: IBitrixV3Credentials = {
    domain: 'example.bitrix24.ru',
    webhook: 'rest/447/abc123',
};

function createService(post: jest.Mock) {
    const http = { post } as unknown as AxiosInstance;
    return new BitrixV3CoreService(credentials, null, http);
}

describe('BitrixV3CoreService', () => {
    it('распаковывает result из единого формата ответа', async () => {
        const post = jest.fn().mockResolvedValue({
            status: 200,
            data: { result: { items: [{ id: 1 }] }, time: {} },
        });
        const service = createService(post);

        const result = await service.request<{ items: Array<{ id: number }> }>(
            'humanresources.node.list',
            { type: 'TEAM' },
        );

        expect(result).toEqual({ items: [{ id: 1 }] });
        expect(post).toHaveBeenCalledWith(
            'https://example.bitrix24.ru/rest/api/447/abc123/humanresources.node.list',
            { type: 'TEAM' },
        );
    });

    it('добавляет auth в тело при OAuth-авторизации', async () => {
        const post = jest.fn().mockResolvedValue({
            status: 200,
            data: { result: { items: [] }, time: {} },
        });
        const http = { post } as unknown as AxiosInstance;
        const service = new BitrixV3CoreService(
            { domain: 'example.bitrix24.ru', accessToken: 'token123' },
            null,
            http,
        );

        await service.request('humanresources.node.list', { type: 'TEAM' });

        expect(post).toHaveBeenCalledWith(
            'https://example.bitrix24.ru/rest/api/humanresources.node.list',
            { type: 'TEAM', auth: 'token123' },
        );
    });

    it('превращает ошибку v3 (HTTP 4xx) в BitrixV3ApiError с кодом и validation', async () => {
        const post = jest.fn().mockRejectedValue({
            response: {
                status: 400,
                data: {
                    error: {
                        code: 'BITRIX_REST_V3_EXCEPTION_VALIDATION_REQUESTVALIDATIONEXCEPTION',
                        message: 'Ошибка при валидации объекта запроса',
                        validation: [
                            {
                                message: 'Parameter "type" is required.',
                                field: 'MISSING_TYPE',
                            },
                        ],
                    },
                },
            },
        });
        const service = createService(post);

        await expect(
            service.request('humanresources.node.list', {}),
        ).rejects.toMatchObject({
            name: 'BitrixV3ApiError',
            code: 'BITRIX_REST_V3_EXCEPTION_VALIDATION_REQUESTVALIDATIONEXCEPTION',
            method: 'humanresources.node.list',
            httpStatus: 400,
            validation: [
                {
                    message: 'Parameter "type" is required.',
                    field: 'MISSING_TYPE',
                },
            ],
        });
    });

    it('превращает ошибку v3 со статусом 200 в BitrixV3ApiError', async () => {
        const post = jest.fn().mockResolvedValue({
            status: 200,
            data: {
                error: { code: 'SOME_ERROR', message: 'Что-то пошло не так' },
            },
        });
        const service = createService(post);

        await expect(
            service.request('humanresources.node.get', { id: 1 }),
        ).rejects.toBeInstanceOf(BitrixV3ApiError);
    });

    it('повторяет запрос после таймаута', async () => {
        const post = jest
            .fn()
            .mockRejectedValueOnce({
                message: 'timeout of 30000ms exceeded',
                code: 'ECONNABORTED',
            })
            .mockResolvedValueOnce({
                status: 200,
                data: { result: { item: { id: 5 } }, time: {} },
            });
        const service = createService(post);

        const result = await service.request<{ item: { id: number } }>(
            'humanresources.node.get',
            { id: 5 },
        );

        expect(result).toEqual({ item: { id: 5 } });
        expect(post).toHaveBeenCalledTimes(2);
    });

    it('пробрасывает не-v3 ошибку после исчерпания ретраев', async () => {
        const networkError = { message: 'Network Error' };
        const post = jest.fn().mockRejectedValue(networkError);
        const service = createService(post);

        await expect(
            service.request('humanresources.node.get', { id: 1 }, 0),
        ).rejects.toBe(networkError);
        expect(post).toHaveBeenCalledTimes(1);
    });
});
