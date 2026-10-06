import { AxiosInstance } from 'axios';
import { BatchApiService } from '../batch-api.service';
import { BitrixCore } from '../bitrix-core.service';
import { IBitrixBatchResponseResult } from '../../interface/bitrix-api-http.intterface';
import { BitrixRateLimitTimeoutError } from '../../rate-limit/bitrix-rate-limiter.service';

/** Сабкласс, открывающий protected-метод сериализации для теста. */
class TestableBatchApiService extends BatchApiService {
    buildQueryString(method: string, data: Record<string, unknown>): string {
        return this.dictToQueryString(method, data);
    }
}

/**
 * Сабкласс с подменённым executeBatch — для тестов callBatchWithConcurrency
 * без сети: каждая запись очереди отвечает заранее заданным результатом.
 */
class FakeExecBatchApiService extends BatchApiService {
    constructor(private readonly responses: unknown[]) {
        super(
            {
                logger: { log: jest.fn(), warn: jest.fn() },
            } as unknown as BitrixCore,
            {} as unknown as AxiosInstance,
        );
    }

    executeCalls = 0;

    protected executeBatch(): Promise<IBitrixBatchResponseResult> {
        const response = this.responses[this.executeCalls];
        this.executeCalls += 1;
        return Promise.resolve(response as IBitrixBatchResponseResult);
    }

    protected sleep(): Promise<void> {
        return Promise.resolve();
    }
}

const okChunk = (key: string): IBitrixBatchResponseResult =>
    ({
        result: { [key]: [] },
        result_error: [],
        result_total: { [key]: 1 },
        result_next: [],
    }) as unknown as IBitrixBatchResponseResult;

const failedChunk = { message: 'timeout of 300000ms exceeded' };

describe('BatchApiService.dictToQueryString', () => {
    const service = new TestableBatchApiService(
        {} as unknown as BitrixCore,
        {} as unknown as AxiosInstance,
    );

    it("экранирует '=' в ключе фильтра ('=ownerId' → '%3DownerId')", () => {
        const query = service.buildQueryString('crm.item.productrow.list', {
            filter: { '=ownerType': 'D', '=ownerId': 123 },
        });
        expect(query).toBe(
            'crm.item.productrow.list?filter[%3DownerType]=D&filter[%3DownerId]=123',
        );
    });

    it('не меняет обычные ключи и префиксы сравнения в ключах без =', () => {
        const query = service.buildQueryString('crm.deal.list', {
            filter: { CATEGORY_ID: 1, '>price': 5 },
        });
        expect(query).toBe(
            'crm.deal.list?filter[CATEGORY_ID]=1&filter[>price]=5',
        );
    });

    it('массивы сериализуются как key[]= с экранированным ключом', () => {
        const query = service.buildQueryString('crm.deal.list', {
            filter: { '=STAGE_ID': ['C1:WON', 'C1:LOSE'] },
        });
        expect(query).toBe(
            'crm.deal.list?filter[%3DSTAGE_ID][]=C1:WON&filter[%3DSTAGE_ID][]=C1:LOSE',
        );
    });
});

describe('BatchApiService.callBatchWithConcurrency', () => {
    /** Наполняет очередь N командами (первый чанк = 50 команд). */
    const fill = (service: BatchApiService, count: number) => {
        for (let i = 0; i < count; i++) {
            service.addCmdBatch(`cmd_${i}`, 'crm.deal.list', { id: i });
        }
    };

    it('по умолчанию упавший чанк пропускается, остальные результаты возвращаются', async () => {
        const service = new FakeExecBatchApiService([
            failedChunk,
            okChunk('cmd_50'),
        ]);
        fill(service, 51); // 2 чанка: 50 + 1

        const results = await service.callBatchWithConcurrency(1);

        expect(results).toHaveLength(1);
        expect(results[0].result_total).toEqual({ cmd_50: 1 });
    });

    it('strict: чанк без result бросает ошибку с offset и причиной', async () => {
        const service = new FakeExecBatchApiService([
            okChunk('cmd_0'),
            failedChunk,
        ]);
        fill(service, 51);

        await expect(
            service.callBatchWithConcurrency(1, { strict: true }),
        ).rejects.toThrow(/offset 50.*timeout of 300000ms exceeded/);
    });

    it('strict: cmdBatch очищается даже при ошибке — следующий вызов не наследует команды', async () => {
        const service = new FakeExecBatchApiService([failedChunk]);
        fill(service, 3);

        await expect(
            service.callBatchWithConcurrency(1, { strict: true }),
        ).rejects.toThrow();

        expect(service.getCmdBatch()).toEqual({});
        // Повторный вызов не выполняет ни одной команды
        const again = await service.callBatchWithConcurrency(1, {
            strict: true,
        });
        expect(again).toEqual([]);
    });

    it('strict: при успешных чанках возвращает те же результаты, что и по умолчанию', async () => {
        const service = new FakeExecBatchApiService([
            okChunk('cmd_0'),
            okChunk('cmd_50'),
        ]);
        fill(service, 51);

        const results = await service.callBatchWithConcurrency(1, {
            strict: true,
        });

        expect(results).toHaveLength(2);
        expect(service.getCmdBatch()).toEqual({});
    });
});

/** Сабкласс, открывающий настоящий executeBatch для теста. */
class ExecutingBatchApiService extends BatchApiService {
    run(batch: [string, string][]) {
        return this.executeBatch(batch);
    }
}

describe('BatchApiService.executeBatch: алерты и шум в логах', () => {
    const WEBHOOK_KEY = 'rest/1/secret-webhook-key';

    const makeService = (request: jest.Mock) => {
        const alert = jest.fn().mockResolvedValue(undefined);
        const log = jest.fn();
        const core = {
            domain: 'portal.bitrix24.ru',
            logger: { log, warn: jest.fn() },
            telegramBot: { sendMessageAdminError: alert },
            request,
        } as unknown as BitrixCore;
        const service = new ExecutingBatchApiService(
            core,
            {} as unknown as AxiosInstance,
        );
        return { service, alert, log };
    };

    it('сбой пачки: в алерт уходит суть ошибки, а не объект axios с ключом вебхука', async () => {
        const axiosError = Object.assign(
            new Error('Request failed with status code 503'),
            {
                code: 'ERR_BAD_RESPONSE',
                config: {
                    url: `https://portal.bitrix24.ru/${WEBHOOK_KEY}/batch`,
                    data: '{"cmd":{"a":"crm.deal.list"}}',
                },
                response: {
                    status: 503,
                    data: { error: 'QUERY_LIMIT_EXCEEDED' },
                },
                toJSON(this: { message: string; config: unknown }) {
                    return { message: this.message, config: this.config };
                },
            },
        );
        const { service, alert } = makeService(
            jest.fn().mockRejectedValue(axiosError),
        );

        await service.run([['a', 'crm.deal.list']]);

        expect(alert).toHaveBeenCalledTimes(1);
        const [message] = alert.mock.calls[0] as [string];
        expect(message).toContain('HTTP 503');
        expect(message).toContain('QUERY_LIMIT_EXCEEDED');
        expect(message).not.toContain(WEBHOOK_KEY);
        expect(message).not.toContain('crm.deal.list');
    });

    it('фону отказано в слоте ограничителя — без алерта', async () => {
        const { service, alert } = makeService(
            jest
                .fn()
                .mockRejectedValue(
                    new BitrixRateLimitTimeoutError(
                        'portal.bitrix24.ru',
                        'background',
                        'cron',
                        600_000,
                    ),
                ),
        );

        await service.run([['a', 'crm.deal.list']]);

        expect(alert).not.toHaveBeenCalled();
    });

    it('успешная пачка с пустым result_error не пишет «success» и не шлёт алертов', async () => {
        const { service, alert, log } = makeService(
            jest.fn().mockResolvedValue({
                data: { result: { result: { a: [] }, result_error: [] } },
            }),
        );

        await service.run([['a', 'crm.deal.list']]);

        expect(alert).not.toHaveBeenCalled();
        expect(log.mock.calls.flat().join(' ')).not.toContain('success');
    });

    it('ошибка команды внутри пачки — алерт с ключом команды', async () => {
        const { service, alert } = makeService(
            jest.fn().mockResolvedValue({
                data: {
                    result: {
                        result: {},
                        result_error: {
                            update_deal_1: { error: 'ACCESS_DENIED' },
                        },
                    },
                },
            }),
        );

        await service.run([['update_deal_1', 'crm.deal.update']]);

        expect(alert).toHaveBeenCalledTimes(1);
        const [firstAlert] = alert.mock.calls as unknown[][];
        expect(String(firstAlert?.[0])).toContain('update_deal_1');
    });
});
