import {
    addCalls,
    emptyCalls,
    hourOfCallStart,
    reduceCallRows,
} from '../lib/digest-calls.util';

describe('digest-calls.util', () => {
    it('hourOfCallStart берёт литеральный час строки портала', () => {
        expect(hourOfCallStart('2026-10-14T09:12:00+03:00')).toBe(9);
        expect(hourOfCallStart('2026-10-14 23:59:59')).toBe(23);
        expect(hourOfCallStart('14.10.2026 09:12:00')).toBeNull();
        expect(hourOfCallStart(undefined)).toBeNull();
    });

    it('reduceCallRows: итоги, направления, бакеты длительности и часы по сотрудникам', () => {
        const partition = reduceCallRows(
            '2026-10-14',
            [
                { CALL_ID: '1', PORTAL_USER_ID: '42', CALL_DURATION: '45', CALL_TYPE: '1', CALL_START_DATE: '2026-10-14T09:10:00+03:00' },
                { CALL_ID: '2', PORTAL_USER_ID: 42, CALL_DURATION: 200, CALL_TYPE: 2, CALL_START_DATE: '2026-10-14T09:50:00+03:00' },
                { CALL_ID: '3', PORTAL_USER_ID: '42', CALL_DURATION: '20', CALL_TYPE: '4', CALL_START_DATE: '2026-10-14T15:00:00+03:00' },
                { CALL_ID: '4', PORTAL_USER_ID: '7', CALL_DURATION: '700', CALL_TYPE: '3', CALL_START_DATE: '2026-10-14T11:00:00+03:00' },
                { CALL_ID: '5', PORTAL_USER_ID: '', CALL_DURATION: '10', CALL_TYPE: '1' },
            ],
            { truncated: false, builtAt: '2026-10-14T12:00:00.000Z' },
        );

        const user = partition.byUser['42'];
        expect(user.callsCount).toBe(3);
        expect(user.airtimeSeconds).toBe(265);
        expect(user.outgoing).toEqual({ count: 2, seconds: 65 });
        expect(user.incoming).toEqual({ count: 1, seconds: 200 });
        expect(user.byDuration).toEqual({
            all: 3,
            '30': 2,
            '60': 1,
            '180': 1,
            '300': 0,
            '600': 0,
        });
        expect(user.byHour[9]).toEqual({ hour: 9, calls: 2, seconds: 245 });
        expect(user.byHour[15]).toEqual({ hour: 15, calls: 1, seconds: 20 });
        expect(user.byHour).toHaveLength(24);

        expect(partition.byUser['7'].byDuration['600']).toBe(1);
        expect(Object.keys(partition.byUser).sort()).toEqual(['42', '7']);
        expect(partition.rowsFetched).toBe(5);
    });

    it('addCalls суммирует ячейки включая часы и бакеты', () => {
        const a = emptyCalls();
        a.callsCount = 1;
        a.airtimeSeconds = 10;
        a.byHour[9].calls = 1;
        a.byDuration.all = 1;
        const total = emptyCalls();
        addCalls(total, a);
        addCalls(total, a);
        expect(total.callsCount).toBe(2);
        expect(total.airtimeSeconds).toBe(20);
        expect(total.byHour[9].calls).toBe(2);
        expect(total.byDuration.all).toBe(2);
    });
});
