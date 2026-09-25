import {
    excludeFromRoundRobin,
    parseUserIds,
} from '../lib/round-robin-exclusion.util';

describe('parseUserIds', () => {
    it('понимает запятые, точки с запятой и пробелы, отбрасывает мусор и дубли', () => {
        expect(parseUserIds('12, 34;56 7, abc, 0, -3, 12')).toEqual([
            12, 34, 56, 7,
        ]);
    });

    it('пусто и не строка — пустой список', () => {
        expect(parseUserIds('')).toEqual([]);
        expect(parseUserIds(undefined)).toEqual([]);
        expect(parseUserIds(null)).toEqual([]);
    });

    it('одно число строкой или числом', () => {
        expect(parseUserIds('387')).toEqual([387]);
        expect(parseUserIds(387)).toEqual([387]);
    });
});

describe('excludeFromRoundRobin', () => {
    it('убирает исключённых и сообщает, кого убрали', () => {
        expect(excludeFromRoundRobin([3, 5, 7], [5, 99])).toEqual({
            candidates: [3, 7],
            removed: [5],
            fellBack: false,
        });
    });

    it('исключены все — исходный список и флаг fellBack', () => {
        expect(excludeFromRoundRobin([3, 5], [3, 5])).toEqual({
            candidates: [3, 5],
            removed: [],
            fellBack: true,
        });
    });

    it('настройка пуста — ничего не меняется', () => {
        expect(excludeFromRoundRobin([3, 5], [])).toEqual({
            candidates: [3, 5],
            removed: [],
            fellBack: false,
        });
    });
});
