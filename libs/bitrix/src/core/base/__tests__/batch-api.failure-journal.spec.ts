import { AxiosInstance } from 'axios';
import {
    annotateCallContext,
    CallEntity,
} from '@/core/call-context/call-context';
import { setProcessAppName } from '@/core/call-context/process-app-name';
import { runAsInteractive } from '../../context/bitrix-call-context';
import { markBitrixFailureReported } from '../../failure/bitrix-failure-record.util';
import { BitrixRateLimitTimeoutError } from '../../rate-limit/bitrix-rate-limiter.service';
import { BatchApiService } from '../batch-api.service';
import { BitrixCore } from '../bitrix-core.service';

/**
 * Пачка: подпись тревог и журнал окончательных сбоев — упавший чанк
 * (если ядро его ещё не записало) и ошибки отдельных команд.
 */

const DOMAIN = 'garant.bitrix24.ru';

class ExecutingBatchApiService extends BatchApiService {
    run(batch: [string, string][]) {
        return this.executeBatch(batch);
    }
}

const makeService = (request: jest.Mock) => {
    const alert = jest.fn().mockResolvedValue(undefined);
    const log = jest.fn<void, unknown[]>();
    const error = jest.fn<void, unknown[]>();
    const core = {
        domain: DOMAIN,
        logger: { log, warn: jest.fn(), error },
        telegramBot: { sendMessageAdminError: alert },
        request,
    } as unknown as BitrixCore;
    const service = new ExecutingBatchApiService(
        core,
        {} as unknown as AxiosInstance,
    );
    return { service, alert, log, error };
};

const BATCH: [string, string][] = [
    ['set_deal', 'crm.deal.update?id=26735&fields[TITLE]=Иванов'],
    ['kpi_1', 'lists.element.add?IBLOCK_ID=5&ELEMENT_CODE=k1'],
];

const metaOf = (mock: jest.Mock, n = 0): unknown =>
    (mock.mock.calls[n] as unknown[] | undefined)?.[1];

const alertLines = (alert: jest.Mock, n = 0): string[] =>
    String((alert.mock.calls[n] as unknown[])[0]).split('\n');

/** Ответ Битрикса без поля result — сбой, которого ядро не видело. */
const brokenResponse = () => Promise.resolve({ data: {} });

/** Карточка, чтение которой бросает: подпись и meta журнала не собираются. */
const brokenEntity = (): CallEntity =>
    Object.defineProperty({ id: '1' }, 'type', {
        enumerable: true,
        get: () => {
            throw new Error('подпись сломана');
        },
    }) as unknown as CallEntity;

describe('BatchApiService: журнал сбоев и подпись тревог', () => {
    beforeEach(() => setProcessAppName('event-sales'));
    afterEach(() => setProcessAppName(''));

    it('чанк упал не на запросе (ответ без result): тревога со «Где» и «Команды», строка журнала kind=batch', async () => {
        const { service, alert, error } = makeService(
            jest.fn().mockImplementation(brokenResponse),
        );

        await runAsInteractive('queue:event-sales-flow', () => {
            annotateCallContext({
                operation: 'Отчёт «Звонки»',
                entity: { type: 'deal', id: '26735' },
                actor: { userId: 325 },
            });
            return service.run(BATCH);
        });

        const lines = alertLines(alert);
        expect(lines[0]).toMatch(
            /^Execute batch failed \(garant\.bitrix24\.ru\): /,
        );
        expect(lines[1]).toBe(
            'Где: event-sales · Отчёт «Звонки» · сделка 26735 · сотрудник 325 · queue:event-sales-flow',
        );
        expect(lines[2]).toBe(
            'Команды (2, запись): сделка ×1, строка списка ×1 · ключи: set_deal, kpi_1',
        );
        expect(error).toHaveBeenCalledTimes(1);
        expect(metaOf(error)).toMatchObject({
            domain: DOMAIN,
            bitrixFailure: {
                kind: 'batch',
                domain: DOMAIN,
                method: 'batch',
                write: true,
                commands: { total: 2, writes: 2 },
            },
            callContext: {
                operation: 'Отчёт «Звонки»',
                app: 'event-sales',
            },
        });
        // В журнал не попадают значения полей команд (данные клиента).
        expect(JSON.stringify(metaOf(error))).not.toContain('Иванов');
    });

    it('сбой запроса batch уже записан ядром — второй строки журнала нет, тревога остаётся', async () => {
        const failure = Object.assign(
            new Error('Request failed with status code 500'),
            {
                response: { status: 500, data: {} },
            },
        );
        markBitrixFailureReported(failure);
        const { service, alert, error } = makeService(
            jest.fn().mockRejectedValue(failure),
        );

        await service.run(BATCH);

        expect(alert).toHaveBeenCalledTimes(1);
        expect(error).not.toHaveBeenCalled();
    });

    it('отказ ограничителя — ни тревоги, ни журнала', async () => {
        const { service, alert, error } = makeService(
            jest
                .fn()
                .mockRejectedValue(
                    new BitrixRateLimitTimeoutError(
                        DOMAIN,
                        'background',
                        'cron',
                        600_000,
                    ),
                ),
        );

        await service.run(BATCH);

        expect(alert).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
    });

    it('ошибка команды внутри пачки: строка лога с kind=command (метод, запись, сущность) и тревога с «Где» и командой', async () => {
        const { service, alert, log } = makeService(
            jest.fn().mockResolvedValue({
                data: {
                    result: {
                        result: { kpi_1: 1 },
                        result_error: {
                            set_deal: {
                                error: 'ERROR_CORE',
                                error_description: 'Стадия недоступна',
                            },
                        },
                    },
                },
            }),
        );

        await runAsInteractive('POST /api/event-sales/flow', () =>
            service.run(BATCH),
        );

        const lines = alertLines(alert);
        expect(lines[0]).toContain('[executeBatch] Ошибка в set_deal');
        expect(lines).toContain(
            'Где: event-sales · POST /api/event-sales/flow',
        );
        expect(lines).toContain('Команда: crm.deal.update (сделка, запись)');

        const journaled = log.mock.calls.find(call => Boolean(call[1]));
        expect(journaled?.[0]).toContain(
            'result_error: [executeBatch] Ошибка в set_deal',
        );
        expect(journaled?.[1]).toEqual({
            domain: DOMAIN,
            bitrixFailure: {
                kind: 'command',
                domain: DOMAIN,
                method: 'crm.deal.update',
                write: true,
                entity: { label: 'сделка', id: '26735' },
                commands: {
                    total: 1,
                    writes: 1,
                    summary: 'сделка ×1',
                    keys: ['set_deal'],
                },
                error: 'ERROR_CORE · Стадия недоступна',
            },
            callContext: {
                source: 'POST /api/event-sales/flow',
                callClass: 'interactive',
                app: 'event-sales',
            },
        });
    });

    it('ожидаемая ошибка команды (дело уже привязано): тревога как раньше, но не в журнал', async () => {
        const { service, alert, log } = makeService(
            jest.fn().mockResolvedValue({
                data: {
                    result: {
                        result: {},
                        result_error: {
                            bind: { error: 'ACTIVITY_IS_ALREADY_BOUND' },
                        },
                    },
                },
            }),
        );

        await service.run([['bind', 'crm.activity.binding.add?activityId=1']]);

        expect(alert).toHaveBeenCalledTimes(1);
        const resultErrorLines = log.mock.calls.filter(call =>
            String(call[0]).startsWith('result_error:'),
        );
        expect(resultErrorLines).toHaveLength(1);
        expect(resultErrorLines[0][1]).toBeUndefined();
    });

    describe('подпись или журнал сломались — пачка работает как раньше', () => {
        it('выполненная пачка с ошибкой команды возвращается как есть; лог и тревога без подписи', async () => {
            const response = {
                result: { kpi_1: 1 },
                result_error: { set_deal: { error: 'ERROR_CORE' } },
            };
            const { service, alert, log } = makeService(
                jest.fn().mockResolvedValue({ data: { result: response } }),
            );

            const result = await runAsInteractive('queue:flow', () => {
                annotateCallContext({ entity: brokenEntity() });
                return service.run(BATCH);
            });

            expect(result).toBe(response);
            expect(alert).toHaveBeenCalledTimes(1);
            const lines = alertLines(alert);
            expect(lines[0]).toContain('[executeBatch] Ошибка в set_deal');
            expect(lines.some(line => line.startsWith('Где:'))).toBe(false);
            const resultErrorLines = log.mock.calls.filter(call =>
                String(call[0]).startsWith('result_error:'),
            );
            expect(resultErrorLines).toHaveLength(1);
            expect(resultErrorLines[0][1]).toBeUndefined();
        });

        it('без strict упавший чанк пропускается, поток не падает', async () => {
            const { service, alert, error } = makeService(
                jest.fn().mockImplementation(brokenResponse),
            );
            Object.assign(service.getCmdBatch(), Object.fromEntries(BATCH));

            const results = await runAsInteractive('queue:flow', () => {
                annotateCallContext({ entity: brokenEntity() });
                return service.callBatchWithConcurrency(1);
            });

            expect(results).toEqual([]);
            expect(alert).toHaveBeenCalledTimes(1);
            expect(error).toHaveBeenCalledTimes(1);
            expect(metaOf(error)).toBeUndefined();
        });
    });
});
