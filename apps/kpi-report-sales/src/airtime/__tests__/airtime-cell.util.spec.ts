import {
    aggregateRowsToCells,
    cellsToUserResults,
    emptyAirtimeCell,
    mergeCellsInto,
} from '../lib/airtime-cell.util';
import {
    AirtimeMonthCell,
    VoximplantAirtimeRow,
} from '../types/airtime-statistic.type';

const row = (
    userId: string,
    duration: number,
    callType: number,
): VoximplantAirtimeRow => ({
    CALL_ID: `${userId}-${duration}-${callType}`,
    PORTAL_USER_ID: userId,
    CALL_DURATION: String(duration),
    CALL_TYPE: String(callType),
});

describe('airtime-cell.util', () => {
    it('aggregateRowsToCells: раскладывает строки по сотрудникам и направлениям', () => {
        const cells = aggregateRowsToCells(
            [row('1', 60, 1), row('1', 30, 2), row('2', 10, 4), row('99', 5, 1)],
            [1, 2],
        );

        expect(cells.get(1)).toEqual({
            callsCount: 2,
            airtimeSeconds: 90,
            incoming: { count: 1, seconds: 30 },
            outgoing: { count: 1, seconds: 60 },
        });
        expect(cells.get(2)?.airtimeSeconds).toBe(10);
        // чужой userId (99) отброшен
        expect(cells.has(99)).toBe(false);
    });

    it('aggregateRowsToCells: создаёт НУЛЕВЫЕ ячейки для сотрудников без звонков (обязательны для кэша)', () => {
        const cells = aggregateRowsToCells([], [7]);
        expect(cells.get(7)).toEqual(emptyAirtimeCell());
    });

    it('mergeCellsInto: суммирует ячейки разных сегментов', () => {
        const target = new Map<number, AirtimeMonthCell>([
            [
                1,
                {
                    callsCount: 1,
                    airtimeSeconds: 10,
                    incoming: { count: 1, seconds: 10 },
                    outgoing: { count: 0, seconds: 0 },
                },
            ],
        ]);
        mergeCellsInto(
            target,
            new Map([
                [
                    1,
                    {
                        callsCount: 2,
                        airtimeSeconds: 50,
                        incoming: { count: 0, seconds: 0 },
                        outgoing: { count: 2, seconds: 50 },
                    },
                ],
                [2, emptyAirtimeCell()],
            ]),
        );

        expect(target.get(1)).toEqual({
            callsCount: 3,
            airtimeSeconds: 60,
            incoming: { count: 1, seconds: 10 },
            outgoing: { count: 2, seconds: 50 },
        });
        expect(target.get(2)).toEqual(emptyAirtimeCell());
    });

    it('cellsToUserResults: порядок и имена из departament, нули для отсутствующих', () => {
        const results = cellsToUserResults(
            new Map([
                [
                    2,
                    {
                        callsCount: 1,
                        airtimeSeconds: 15,
                        incoming: { count: 1, seconds: 15 },
                        outgoing: { count: 0, seconds: 0 },
                    },
                ],
            ]),
            [
                { ID: '1', NAME: 'Иван', LAST_NAME: 'Иванов' },
                { ID: '2', NAME: 'Пётр', LAST_NAME: 'Петров' },
            ],
        );

        expect(results.map(r => r.userName)).toEqual([
            'Иван Иванов',
            'Пётр Петров',
        ]);
        expect(results[0].airtimeSeconds).toBe(0);
        expect(results[1].airtimeSeconds).toBe(15);
    });
});
