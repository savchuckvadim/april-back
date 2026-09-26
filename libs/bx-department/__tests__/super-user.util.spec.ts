import { isSuperUserId, parseSuperUserIds } from '../lib/super-user.util';

describe('super-user.util', () => {
    describe('parseSuperUserIds', () => {
        it('разбирает список domain:id по порталам', () => {
            const { map, invalid } = parseSuperUserIds(
                'example.bitrix24.ru:123,other.bitrix24.ru:456',
            );

            expect(invalid).toEqual([]);
            expect([...map.keys()]).toEqual([
                'example.bitrix24.ru',
                'other.bitrix24.ru',
            ]);
            expect([...(map.get('example.bitrix24.ru') ?? [])]).toEqual([123]);
            expect([...(map.get('other.bitrix24.ru') ?? [])]).toEqual([456]);
        });

        it('пробелы вокруг записей, домена и id не мешают', () => {
            const { map, invalid } = parseSuperUserIds(
                '  example.bitrix24.ru : 123 ,  other.bitrix24.ru:456  ,',
            );

            expect(invalid).toEqual([]);
            expect(isSuperUserId('example.bitrix24.ru', 123, map)).toBe(true);
            expect(isSuperUserId('other.bitrix24.ru', 456, map)).toBe(true);
        });

        it('домен без учёта регистра — и в env, и в проверке', () => {
            const { map } = parseSuperUserIds('Example.Bitrix24.RU:123');

            expect(map.has('example.bitrix24.ru')).toBe(true);
            expect(isSuperUserId('EXAMPLE.bitrix24.ru', 123, map)).toBe(true);
        });

        it('несколько id на один портал и дубли — один набор', () => {
            const { map } = parseSuperUserIds('a.ru:1,a.ru:2,A.ru:1');

            expect([...(map.get('a.ru') ?? [])]).toEqual([1, 2]);
        });

        it('мусорные записи пропускаются и возвращаются в invalid', () => {
            const { map, invalid } = parseSuperUserIds(
                [
                    'a.ru:447',
                    'b.ru',
                    ':12',
                    'c.ru:',
                    'd.ru:0',
                    'e.ru:-5',
                    'f.ru:1.5',
                    'g.ru:abc',
                    'h.ru:1:2',
                    'i i.ru:3',
                    '447',
                ].join(','),
            );

            expect([...map.keys()]).toEqual(['a.ru']);
            expect(invalid).toEqual([
                'b.ru',
                ':12',
                'c.ru:',
                'd.ru:0',
                'e.ru:-5',
                'f.ru:1.5',
                'g.ru:abc',
                'h.ru:1:2',
                'i i.ru:3',
                '447',
            ]);
        });

        it('пустое значение, пробелы и undefined — суперпользователей нет', () => {
            for (const raw of [undefined, null, '', '   ', ', ,']) {
                const { map, invalid } = parseSuperUserIds(raw);
                expect(map.size).toBe(0);
                expect(invalid).toEqual([]);
            }
        });
    });

    describe('isSuperUserId', () => {
        const { map } = parseSuperUserIds('a.ru:447');

        it('только указанный пользователь указанного портала', () => {
            expect(isSuperUserId('a.ru', 447, map)).toBe(true);
            expect(isSuperUserId('a.ru', 448, map)).toBe(false);
            expect(isSuperUserId('b.ru', 447, map)).toBe(false);
        });

        it('id ≤ 0 и нецелые id — никогда не суперпользователь', () => {
            expect(isSuperUserId('a.ru', 0, map)).toBe(false);
            expect(isSuperUserId('a.ru', -447, map)).toBe(false);
            expect(isSuperUserId('a.ru', Number.NaN, map)).toBe(false);
            expect(isSuperUserId('a.ru', 447.5, map)).toBe(false);
        });
    });
});
