import { parseUserIds } from '../lib/parse-user-ids';

describe('parseUserIds', () => {
    it.each([
        ['запятые с пробелами', '32, 40, 1', [32, 40, 1]],
        ['точка с запятой и пробелы', '1;42 107', [1, 42, 107]],
        ['дубли и нули', '5, 5, 0, -3, 7', [5, 7]],
        ['мусор', 'abc, 1.5, 9', [9]],
        ['пусто', '', []],
        ['null', null, []],
        ['undefined', undefined, []],
        ['только разделители', ' , ; ', []],
    ])('%s', (_name, raw, expected) => {
        expect(parseUserIds(raw)).toEqual(expected);
    });
});
