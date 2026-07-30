import { AirtimeDaySpanCollectorUseCase } from '../use-cases/airtime-day-span-collector.use-case';
import type { VoximplantAirtimeRow } from '../types/airtime-statistic.type';

const DOMAIN = 'example.bitrix24.ru';
// «Сейчас»: 30 июля 2026 — сегодня 2026-07-30.
const NOW = new Date(2026, 6, 30, 12, 0, 0);

const row = (
    userId: string,
    day: string,
    duration = 10,
): VoximplantAirtimeRow => ({
    CALL_ID: `${userId}-${day}`,
    PORTAL_USER_ID: userId,
    CALL_DURATION: String(duration),
    CALL_TYPE: '1',
    CALL_START_DATE: `${day}T10:00:00+03:00`,
});

const createMocks = (responses: unknown[], markedDays: string[] = []) => {
    const call = jest.fn<Promise<unknown>, unknown[]>();
    responses.forEach(r => call.mockResolvedValueOnce(r));
    return {
        api: { call },
        cellCache: {
            setDayCells: jest.fn<Promise<void>, unknown[]>(() =>
                Promise.resolve(undefined),
            ),
        },
        markerCache: {
            getDayMarkers: jest.fn((_d: string, dates: string[]) =>
                Promise.resolve(
                    new Map(
                        dates.map(date => [
                            date,
                            markedDays.includes(date)
                                ? { truncated: false, rowsFetched: 1 }
                                : null,
                        ]),
                    ),
                ),
            ),
            setDayMarkers: jest.fn<Promise<void>, unknown[]>(() =>
                Promise.resolve(undefined),
            ),
            setTodayBlob: jest.fn<Promise<void>, unknown[]>(() =>
                Promise.resolve(undefined),
            ),
            clearErrorMarker: jest.fn<Promise<void>, unknown[]>(() =>
                Promise.resolve(undefined),
            ),
        },
    };
};

const createUseCase = (mocks: ReturnType<typeof createMocks>) =>
    new AirtimeDaySpanCollectorUseCase(
        mocks.api as never,
        mocks.cellCache as never,
        mocks.markerCache as never,
        DOMAIN,
    );

describe('AirtimeDaySpanCollectorUseCase', () => {
    it('дособирает только дни без маркеров одной выборкой [первый..последний промах]', async () => {
        const mocks = createMocks(
            [{ result: [row('1', '2026-07-03'), row('2', '2026-07-04')] }],
            ['2026-07-01', '2026-07-02', '2026-07-05'],
        );

        const result = await createUseCase(mocks).collect(
            '2026-07-01',
            '2026-07-05',
            false,
            NOW,
        );

        expect(result.rowsFetched).toBe(2);
        // Выборка от первого промаха (03) до последнего (04) эксклюзивно (05)
        expect(mocks.api.call).toHaveBeenCalledTimes(1);
        expect(mocks.api.call).toHaveBeenCalledWith(
            'voximplant.statistic.get',
            expect.objectContaining({
                FILTER: expect.objectContaining({
                    '>CALL_START_DATE': '2026-07-03',
                    '<CALL_START_DATE': '2026-07-05',
                }) as Record<string, unknown>,
            }),
        );
        // Маркеры пишутся на все дни выборки
        const markers = mocks.markerCache.setDayMarkers.mock.calls[0][1] as Map<
            string,
            { rowsFetched: number }
        >;
        expect([...markers.keys()]).toEqual(['2026-07-03', '2026-07-04']);
        expect(markers.get('2026-07-03')?.rowsFetched).toBe(1);
    });

    it('все дни собраны и диапазон без сегодня → в Битрикс не ходит', async () => {
        const mocks = createMocks(
            [],
            ['2026-07-01', '2026-07-02', '2026-07-03'],
        );

        const result = await createUseCase(mocks).collect(
            '2026-07-01',
            '2026-07-03',
            false,
            NOW,
        );

        expect(result).toEqual({ rowsFetched: 0, truncated: false });
        expect(mocks.api.call).not.toHaveBeenCalled();
        expect(mocks.markerCache.setTodayBlob).not.toHaveBeenCalled();
    });

    it('диапазон с сегодняшним днём → живой today-блоб с ячейками по userId', async () => {
        const mocks = createMocks([{ result: [row('5', '2026-07-30', 42)] }]);

        const result = await createUseCase(mocks).collect(
            '2026-07-30',
            '2026-07-30',
            false,
            NOW,
        );

        expect(result.rowsFetched).toBe(1);
        expect(mocks.markerCache.setTodayBlob).toHaveBeenCalledWith(
            DOMAIN,
            expect.objectContaining({
                date: '2026-07-30',
                rowsFetched: 1,
                truncated: false,
            }),
        );
        const blob = mocks.markerCache.setTodayBlob.mock.calls[0][1] as {
            cells: Record<string, { airtimeSeconds: number }>;
        };
        expect(blob.cells['5'].airtimeSeconds).toBe(42);
        // Дневные маркеры на сегодня не пишутся (день не завершён)
        expect(mocks.markerCache.setDayMarkers).not.toHaveBeenCalled();
    });

    it('forceRefresh пересобирает все дни, игнорируя маркеры', async () => {
        const mocks = createMocks(
            [{ result: [] }],
            ['2026-07-01', '2026-07-02', '2026-07-03'],
        );

        await createUseCase(mocks).collect(
            '2026-07-01',
            '2026-07-03',
            true,
            NOW,
        );

        expect(mocks.api.call).toHaveBeenCalledWith(
            'voximplant.statistic.get',
            expect.objectContaining({
                FILTER: expect.objectContaining({
                    '>CALL_START_DATE': '2026-07-01',
                    '<CALL_START_DATE': '2026-07-04',
                }) as Record<string, unknown>,
            }),
        );
    });

    it('успешный сбор снимает error-маркер месяца диапазона', async () => {
        const mocks = createMocks([], ['2026-07-01']);

        await createUseCase(mocks).collect(
            '2026-07-01',
            '2026-07-01',
            false,
            NOW,
        );

        expect(mocks.markerCache.clearErrorMarker).toHaveBeenCalledWith(
            DOMAIN,
            '2026-07',
        );
    });
});
