import { Logger } from '@nestjs/common';
import { UserNamesReader } from '../domain/loaders/user-names.reader';

interface UserRow {
    ID: string;
    NAME?: string;
    LAST_NAME?: string;
}

/** Мок bitrix.user.get: отвечает на фильтр =ID строками пользователей. */
function bitrixWith(rowOf: (id: string) => UserRow) {
    const get = jest.fn((filter: { '=ID': string[] }) =>
        Promise.resolve({ result: filter['=ID'].map(rowOf) }),
    );

    return { bitrix: { user: { get } }, get };
}

const named = (id: string): UserRow => ({
    ID: id,
    NAME: `Имя${id}`,
    LAST_NAME: `Фамилия${id}`,
});

describe('UserNamesReader: имена сотрудников пачкой', () => {
    it('один user.get с фильтром =ID на всех; подпись «Фамилия Имя»', async () => {
        const { bitrix, get } = bitrixWith(named);

        const names = await new UserNamesReader(bitrix as never).read([
            '20',
            '10',
            '10',
            'x',
        ]);

        expect(get).toHaveBeenCalledTimes(1);
        expect(get).toHaveBeenCalledWith({ '=ID': ['10', '20'] }, [
            'ID',
            'NAME',
            'LAST_NAME',
        ]);
        expect(names).toEqual(
            new Map([
                ['10', 'Фамилия10 Имя10'],
                ['20', 'Фамилия20 Имя20'],
            ]),
        );
    });

    it('больше 50 id — по вызову на каждую страницу user.get', async () => {
        const { bitrix, get } = bitrixWith(named);
        const ids = Array.from({ length: 120 }, (_, index) =>
            String(index + 1),
        );

        const names = await new UserNamesReader(bitrix as never).read(ids);

        expect(get).toHaveBeenCalledTimes(3);
        expect(get.mock.calls.map(([filter]) => filter['=ID'].length)).toEqual([
            50, 50, 20,
        ]);
        expect(names.size).toBe(120);
    });

    it('пустое имя в карту не попадает; сбой пачки — warn, остальные пачки читаются', async () => {
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        const { bitrix, get } = bitrixWith(id =>
            id === '2' ? { ID: id, NAME: ' ', LAST_NAME: '' } : named(id),
        );
        get.mockRejectedValueOnce(new Error('QUERY_LIMIT_EXCEEDED'));
        const ids = Array.from({ length: 60 }, (_, index) => String(index + 1));

        const names = await new UserNamesReader(bitrix as never).read(ids);

        // Первая пачка (1–50) упала, вторая (51–60) прочитана.
        expect(names.size).toBe(10);
        expect(names.get('51')).toBe('Фамилия51 Имя51');
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('QUERY_LIMIT_EXCEEDED'),
        );
        warn.mockRestore();

        const { bitrix: blank } = bitrixWith(id =>
            id === '2' ? { ID: id, NAME: ' ', LAST_NAME: '' } : named(id),
        );
        const partial = await new UserNamesReader(blank as never).read([
            '1',
            '2',
        ]);
        expect([...partial.keys()]).toEqual(['1']);
    });
});
