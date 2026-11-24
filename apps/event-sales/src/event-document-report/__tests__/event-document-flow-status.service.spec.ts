import { Logger } from '@nestjs/common';
import { EventDocumentFlowStatusService } from '../services/status/event-document-flow-status.service';
import { DOCUMENT_DOMAIN, DOCUMENT_EVENT_ID } from './event-document.fixtures';

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

type SetArgs = [string, string, 'EX', number, 'NX'];

const makeService = (
    over: {
        set?: () => Promise<string | null>;
        del?: () => Promise<number>;
        getClient?: () => unknown;
    } = {},
) => {
    const set = jest
        .fn<Promise<string | null>, SetArgs>()
        .mockImplementation(over.set ?? (() => Promise.resolve('OK')));
    const del = jest
        .fn<Promise<number>, [string]>()
        .mockImplementation(over.del ?? (() => Promise.resolve(1)));
    const getClient = over.getClient ?? (() => ({ set, del }));
    const service = new EventDocumentFlowStatusService({
        getClient,
    } as never);
    return { service, set, del };
};

/**
 * Отметка «событие взято в работу»: Bull доставляет джоб минимум один раз, и
 * без отметки документ, повторно доставленный после падения воркера, был бы
 * засчитан дважды. Недоступный Redis защиту отключает, но документ не теряет.
 */
describe('EventDocumentFlowStatusService — отметка события в Redis', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });

    afterEach(() => jest.restoreAllMocks());

    // Занять можно один раз; без Redis событие считается свободным.
    describe('reserve — занять событие', () => {
        it('ставит ключ атомарно (NX) на семь суток, ключ содержит домен и номер события', async () => {
            const { service, set } = makeService();

            await service.reserve(DOCUMENT_DOMAIN, DOCUMENT_EVENT_ID);

            expect(set).toHaveBeenCalledTimes(1);
            const [key, value, mode, ttl, condition] = set.mock.calls[0];
            expect(key).toContain(DOCUMENT_DOMAIN);
            expect(key).toContain(DOCUMENT_EVENT_ID);
            expect([value, mode, ttl, condition]).toEqual([
                '1',
                'EX',
                SEVEN_DAYS_SECONDS,
                'NX',
            ]);
        });

        it('Redis ответил «OK» — событие занято нами', async () => {
            const { service } = makeService({
                set: () => Promise.resolve('OK'),
            });

            await expect(
                service.reserve(DOCUMENT_DOMAIN, DOCUMENT_EVENT_ID),
            ).resolves.toBe(true);
        });

        it('Redis ответил null (ключ уже есть) — событие уже выполнялось', async () => {
            const { service } = makeService({
                set: () => Promise.resolve(null),
            });

            await expect(
                service.reserve(DOCUMENT_DOMAIN, DOCUMENT_EVENT_ID),
            ).resolves.toBe(false);
        });

        it('разные события и разные порталы получают разные ключи', async () => {
            const { service, set } = makeService();

            await service.reserve(DOCUMENT_DOMAIN, 'ev-1');
            await service.reserve(DOCUMENT_DOMAIN, 'ev-2');
            await service.reserve('b.bitrix24.ru', 'ev-1');

            const keys = set.mock.calls.map(call => call[0]);
            expect(new Set(keys).size).toBe(3);
        });

        it('Redis бросил ошибку — работаем без защиты: событие считается свободным', async () => {
            const { service } = makeService({
                set: () => Promise.reject(new Error('ECONNREFUSED')),
            });

            await expect(
                service.reserve(DOCUMENT_DOMAIN, DOCUMENT_EVENT_ID),
            ).resolves.toBe(true);
            expect(warn).toHaveBeenCalledWith(
                expect.stringContaining('без защиты от повтора'),
            );
        });

        it('клиент Redis не получен — тоже работаем без защиты', async () => {
            const { service } = makeService({
                getClient: () => {
                    throw new Error('нет клиента');
                },
            });

            await expect(
                service.reserve(DOCUMENT_DOMAIN, DOCUMENT_EVENT_ID),
            ).resolves.toBe(true);
        });
    });

    // Снимается тот же ключ; сбой Redis не ломает обработку события.
    describe('release — вернуть событие в работу', () => {
        it('удаляет тот же ключ, который ставил reserve', async () => {
            const { service, set, del } = makeService();

            await service.reserve(DOCUMENT_DOMAIN, DOCUMENT_EVENT_ID);
            await service.release(DOCUMENT_DOMAIN, DOCUMENT_EVENT_ID);

            expect(del).toHaveBeenCalledTimes(1);
            expect(del).toHaveBeenCalledWith(set.mock.calls[0][0]);
        });

        it('ошибка Redis наружу не пробрасывается, но попадает в журнал', async () => {
            const { service } = makeService({
                del: () => Promise.reject(new Error('ECONNRESET')),
            });

            await expect(
                service.release(DOCUMENT_DOMAIN, DOCUMENT_EVENT_ID),
            ).resolves.toBeUndefined();
            expect(warn).toHaveBeenCalledWith(
                expect.stringContaining('не снята'),
            );
        });

        it('клиент Redis не получен — release тоже не падает', async () => {
            const { service } = makeService({
                getClient: () => {
                    throw new Error('нет клиента');
                },
            });

            await expect(
                service.release(DOCUMENT_DOMAIN, DOCUMENT_EVENT_ID),
            ).resolves.toBeUndefined();
        });
    });
});
