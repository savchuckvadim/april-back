import { CallingStatisticUseCase } from '../use-cases/kpi-calling-statistic.use-case';
import { IncompleteBatchError } from '../../shared/lib/batch-completeness.util';
import type { GetCallingStatisticDto } from '../dto/calling-statistic.dto';
import type { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';

const METHOD = 'voximplant.statistic.get';
const BUCKETS = ['all', 30, 60, 180, 300, 600] as const;

const chunk = (totals: Record<string, number>): IBitrixBatchResponseResult =>
    ({
        result: Object.fromEntries(Object.keys(totals).map(k => [k, []])),
        result_total: totals,
        result_error: [],
        result_next: [],
    }) as unknown as IBitrixBatchResponseResult;

const fullTotals = (userId: string, base = 0): Record<string, number> =>
    Object.fromEntries(
        BUCKETS.map((bucket, i) => [`${METHOD}_${bucket}_${userId}`, base + i]),
    );

const createApi = (chunks: IBitrixBatchResponseResult[]) => ({
    addCmdBatch: jest.fn(),
    callBatchWithConcurrency: jest.fn(() => Promise.resolve(chunks)),
});

const createCache = () => ({
    setReady: jest.fn(() => Promise.resolve(undefined)),
});

const dto = (
    dateFrom: string,
    dateTo: string,
    users = [{ ID: '1', NAME: 'Иван', LAST_NAME: 'Иванов' }],
): GetCallingStatisticDto =>
    ({
        domain: 'example.bitrix24.ru',
        filters: { departament: users, dateFrom, dateTo },
    }) as GetCallingStatisticDto;

describe('CallingStatisticUseCase', () => {
    it('легаси-запрос шлёт в фильтр ИСХОДНЫЕ строки дат (байт-в-байт как прод) + strict-батч', async () => {
        const api = createApi([chunk(fullTotals('1'))]);
        const useCase = new CallingStatisticUseCase(api as never);

        // Легаси-формат: строки уходят в Битрикс без изменений.
        await useCase.get(dto('01.07.2026', '31.07.2026'));

        expect(api.addCmdBatch).toHaveBeenCalledTimes(6);
        expect(api.addCmdBatch).toHaveBeenCalledWith(
            `${METHOD}_all_1`,
            METHOD,
            {
                FILTER: {
                    PORTAL_USER_ID: '1',
                    '>CALL_START_DATE': '01.07.2026',
                    '<CALL_START_DATE': '31.07.2026',
                },
            },
        );
        // Бакет 30 — с фильтром длительности
        expect(api.addCmdBatch).toHaveBeenCalledWith(`${METHOD}_30_1`, METHOD, {
            FILTER: expect.objectContaining({
                '>CALL_DURATION': 30,
            }) as Record<string, unknown>,
        });
        expect(api.callBatchWithConcurrency).toHaveBeenCalledWith(2, {
            strict: true,
        });
    });

    it('канон-запрос (YYYY-MM-DD) шлёт в фильтр DD.MM.YYYY: from вкл., to+1 экскл.', async () => {
        const api = createApi([chunk(fullTotals('1'))]);
        const useCase = new CallingStatisticUseCase(api as never);

        await useCase.get(dto('2026-07-01', '2026-07-30'));

        expect(api.addCmdBatch).toHaveBeenCalledWith(
            `${METHOD}_all_1`,
            METHOD,
            {
                FILTER: {
                    PORTAL_USER_ID: '1',
                    '>CALL_START_DATE': '01.07.2026',
                    '<CALL_START_DATE': '31.07.2026',
                },
            },
        );
    });

    it('счётчики из result_total, у каждого сотрудника ровно 6 бакетов', async () => {
        const api = createApi([chunk(fullTotals('1', 10))]);
        const useCase = new CallingStatisticUseCase(api as never);

        const result = await useCase.get(dto('2026-06-01', '2026-06-30'));

        expect(result).toHaveLength(1);
        expect(result[0].callings).toHaveLength(6);
        expect(result[0].callings[0]).toEqual({
            id: 'all',
            action: 'Наборов номера',
            count: 10,
            duration: 0,
        });
    });

    it('пропавшая команда → IncompleteBatchError, кэш НЕ записан', async () => {
        const totals = fullTotals('1');
        delete totals[`${METHOD}_600_1`];
        const api = createApi([chunk(totals)]);
        const cache = createCache();
        const useCase = new CallingStatisticUseCase(
            api as never,
            cache as never,
        );

        await expect(
            useCase.get(dto('2026-06-01', '2026-06-30')),
        ).rejects.toBeInstanceOf(IncompleteBatchError);
        expect(cache.setReady).not.toHaveBeenCalled();
    });

    describe('TTL записи кэша (сейчас — 25.11.2026)', () => {
        const CLOSED_TTL = 180 * 24 * 3600;
        const BUFFER_TTL = 180;

        beforeEach(() => {
            jest.useFakeTimers().setSystemTime(new Date(2026, 10, 25, 12, 0));
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        const getAndReadWrite = async (
            dateFrom: string,
            dateTo: string,
        ): Promise<{ app: unknown; key: unknown; ttl: unknown }> => {
            const api = createApi([chunk(fullTotals('1'))]);
            const cache = createCache();
            const useCase = new CallingStatisticUseCase(
                api as never,
                cache as never,
            );

            await useCase.get(dto(dateFrom, dateTo));

            expect(cache.setReady).toHaveBeenCalledTimes(1);
            const call = cache.setReady.mock.calls[0] as unknown as unknown[];
            return { app: call[0], key: call[2], ttl: call[4] };
        };

        it('закрытый период (прошлые месяцы) → долгий TTL 180 суток', async () => {
            const { app, key, ttl } = await getAndReadWrite(
                '2026-06-01',
                '2026-06-30',
            );

            expect(app).toBe('calling-stat');
            expect(key).toBe('v1:result:2026-06-01_2026-06-30:1');
            expect(ttl).toBe(CLOSED_TTL);
        });

        it('закрытый период в легаси-формате (dateTo эксклюзивна) → долгий TTL', async () => {
            const { key, ttl } = await getAndReadWrite(
                '01.10.2026',
                '01.11.2026',
            );

            expect(key).toBe('v1:result:2026-10-01_2026-10-31:1');
            expect(ttl).toBe(CLOSED_TTL);
        });

        it('открытый период (задевает текущий месяц) → буфер 180 секунд', async () => {
            const { ttl } = await getAndReadWrite('2026-11-01', '2026-11-25');

            expect(ttl).toBe(BUFFER_TTL);
        });

        it('период, кончающийся первым днём текущего месяца → буфер 180 секунд', async () => {
            const { ttl } = await getAndReadWrite('2026-10-01', '2026-11-01');

            expect(ttl).toBe(BUFFER_TTL);
        });
    });

    it('сотрудник без ID — пустые callings, команды по нему не строятся', async () => {
        const api = createApi([chunk(fullTotals('1'))]);
        const useCase = new CallingStatisticUseCase(api as never);

        const result = await useCase.get(
            dto('2026-06-01', '2026-06-30', [
                { ID: '1', NAME: 'Иван', LAST_NAME: 'Иванов' },
                { ID: '', NAME: 'Без', LAST_NAME: 'Айди' },
            ]),
        );

        expect(api.addCmdBatch).toHaveBeenCalledTimes(6);
        expect(result[1].callings).toEqual([]);
    });
});
