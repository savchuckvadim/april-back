import {
    AirtimePageDroppedError,
    buildAirtimeFilter,
    fetchAirtimeRows,
} from '../lib/voximplant-fetch.util';
import type {
    VoximplantAirtimeRow,
    VoximplantStatisticEnvelope,
} from '../types/airtime-statistic.type';

const row = (id: string): VoximplantAirtimeRow => ({
    CALL_ID: id,
    PORTAL_USER_ID: '1',
    CALL_DURATION: '10',
    CALL_TYPE: '1',
});

const loggerMock = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

const apiMock = (responses: unknown[]) => {
    const call = jest.fn<Promise<unknown>, unknown[]>();
    responses.forEach(r => call.mockResolvedValueOnce(r));
    return { call };
};

describe('buildAirtimeFilter', () => {
    it('с userIds — фильтр по сотрудникам отдела', () => {
        expect(buildAirtimeFilter([1, 2], '2026-06-01', '2026-07-01')).toEqual({
            PORTAL_USER_ID: ['1', '2'],
            '>CALL_START_DATE': '2026-06-01',
            '<CALL_START_DATE': '2026-07-01',
            '>CALL_DURATION': 0,
        });
    });

    it('без userIds — портал-wide выборка без PORTAL_USER_ID', () => {
        const filter = buildAirtimeFilter(
            undefined,
            '2026-06-01',
            '2026-07-01',
        );
        expect(filter).not.toHaveProperty('PORTAL_USER_ID');
        expect(filter['>CALL_DURATION']).toBe(0);
    });
});

describe('fetchAirtimeRows', () => {
    it('склеивает страницы по next и останавливается на последней', async () => {
        const api = apiMock([
            { result: [row('a'), row('b')], next: 2 },
            { result: [row('c')] },
        ] satisfies VoximplantStatisticEnvelope[]);

        const { rows, truncated } = await fetchAirtimeRows(
            api as never,
            buildAirtimeFilter([1], '2026-06-01', '2026-07-01'),
            100,
            loggerMock as never,
        );

        expect(rows.map(r => r.CALL_ID)).toEqual(['a', 'b', 'c']);
        expect(truncated).toBe(false);
        expect(api.call).toHaveBeenCalledTimes(2);
    });

    it('останавливается по лимиту строк и помечает truncated', async () => {
        const api = apiMock([
            { result: [row('a'), row('b')], next: 2 },
            { result: [row('c'), row('d')], next: 4 },
        ]);

        const { rows, truncated } = await fetchAirtimeRows(
            api as never,
            buildAirtimeFilter([1], '2026-06-01', '2026-07-01'),
            3,
            loggerMock as never,
        );

        expect(rows).toHaveLength(4); // страница дочитывается целиком
        expect(truncated).toBe(true);
        expect(api.call).toHaveBeenCalledTimes(2);
    });

    it('конверт без поля result (дроп лимитера) → AirtimePageDroppedError', async () => {
        const api = apiMock([{ result: [row('a')], next: 2 }, {}]);

        await expect(
            fetchAirtimeRows(
                api as never,
                buildAirtimeFilter([1], '2026-06-01', '2026-07-01'),
                100,
                loggerMock as never,
            ),
        ).rejects.toBeInstanceOf(AirtimePageDroppedError);
    });

    it('null-ответ → AirtimePageDroppedError', async () => {
        const api = apiMock([null]);

        await expect(
            fetchAirtimeRows(
                api as never,
                buildAirtimeFilter([1], '2026-06-01', '2026-07-01'),
                100,
                loggerMock as never,
            ),
        ).rejects.toBeInstanceOf(AirtimePageDroppedError);
    });

    it('легитимный пустой ответ { result: [] } — не ошибка', async () => {
        const api = apiMock([{ result: [] }]);

        const { rows, truncated } = await fetchAirtimeRows(
            api as never,
            buildAirtimeFilter([1], '2026-06-01', '2026-07-01'),
            100,
            loggerMock as never,
        );

        expect(rows).toEqual([]);
        expect(truncated).toBe(false);
    });
});
