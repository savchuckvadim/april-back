import { AirtimeMonthCollectorUseCase } from '../use-cases/airtime-month-collector.use-case';
import { AirtimePageDroppedError } from '../lib/voximplant-fetch.util';
import type { VoximplantAirtimeRow } from '../types/airtime-statistic.type';

const DOMAIN = 'example.bitrix24.ru';

const row = (userId: string, duration: number): VoximplantAirtimeRow => ({
    CALL_ID: `${userId}-${duration}`,
    PORTAL_USER_ID: userId,
    CALL_DURATION: String(duration),
    CALL_TYPE: '1',
});

const createMocks = (responses: unknown[]) => {
    const call = jest.fn<Promise<unknown>, unknown[]>();
    responses.forEach(r => call.mockResolvedValueOnce(r));
    return {
        api: { call },
        cellCache: {
            setMonthCells: jest.fn<Promise<void>, unknown[]>(() =>
                Promise.resolve(undefined),
            ),
        },
        markerCache: {
            setMonthMarker: jest.fn<Promise<void>, unknown[]>(() =>
                Promise.resolve(undefined),
            ),
            clearErrorMarker: jest.fn<Promise<void>, unknown[]>(() =>
                Promise.resolve(undefined),
            ),
        },
    };
};

describe('AirtimeMonthCollectorUseCase', () => {
    it('собирает месяц ПО ВСЕМУ порталу: без PORTAL_USER_ID, границы месяца строгие', async () => {
        const mocks = createMocks([{ result: [] }]);
        const useCase = new AirtimeMonthCollectorUseCase(
            mocks.api as never,
            mocks.cellCache as never,
            mocks.markerCache as never,
            DOMAIN,
        );

        await useCase.collect('2026-06');

        expect(mocks.api.call).toHaveBeenCalledWith(
            'voximplant.statistic.get',
            expect.objectContaining({
                FILTER: {
                    '>CALL_START_DATE': '2026-06-01',
                    '<CALL_START_DATE': '2026-07-01',
                    '>CALL_DURATION': 0,
                },
            }),
        );
    });

    it('пишет ячейки, затем ready-маркер, затем снимает error-маркер (строгий порядок)', async () => {
        const mocks = createMocks([{ result: [row('1', 60), row('2', 30)] }]);
        const useCase = new AirtimeMonthCollectorUseCase(
            mocks.api as never,
            mocks.cellCache as never,
            mocks.markerCache as never,
            DOMAIN,
        );

        const result = await useCase.collect('2026-06');

        expect(result).toEqual({ rowsFetched: 2, truncated: false });
        expect(mocks.cellCache.setMonthCells).toHaveBeenCalledWith(
            DOMAIN,
            '2026-06',
            expect.any(Map),
        );
        expect(mocks.markerCache.setMonthMarker).toHaveBeenCalledWith(
            DOMAIN,
            '2026-06',
            expect.objectContaining({ truncated: false, rowsFetched: 2 }),
        );
        expect(mocks.markerCache.clearErrorMarker).toHaveBeenCalledWith(
            DOMAIN,
            '2026-06',
        );

        const cellsOrder =
            mocks.cellCache.setMonthCells.mock.invocationCallOrder[0];
        const markerOrder =
            mocks.markerCache.setMonthMarker.mock.invocationCallOrder[0];
        expect(cellsOrder).toBeLessThan(markerOrder);
    });

    it('нулевые ячейки не пишутся — ноль кодируется маркером', async () => {
        const mocks = createMocks([{ result: [row('7', 15)] }]);
        const useCase = new AirtimeMonthCollectorUseCase(
            mocks.api as never,
            mocks.cellCache as never,
            mocks.markerCache as never,
            DOMAIN,
        );

        await useCase.collect('2026-06');

        const cells = mocks.cellCache.setMonthCells.mock.calls[0][2] as Map<
            number,
            unknown
        >;
        expect([...cells.keys()]).toEqual([7]);
    });

    it('дроп страницы → исключение, ни ячейки, ни маркер не пишутся', async () => {
        const mocks = createMocks([{}]);
        const useCase = new AirtimeMonthCollectorUseCase(
            mocks.api as never,
            mocks.cellCache as never,
            mocks.markerCache as never,
            DOMAIN,
        );

        await expect(useCase.collect('2026-06')).rejects.toBeInstanceOf(
            AirtimePageDroppedError,
        );
        expect(mocks.cellCache.setMonthCells).not.toHaveBeenCalled();
        expect(mocks.markerCache.setMonthMarker).not.toHaveBeenCalled();
    });
});
