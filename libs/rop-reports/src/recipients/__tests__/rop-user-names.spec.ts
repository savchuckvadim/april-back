import { userNamesOf } from '../rop-user-names';

describe('userNamesOf — имена сотрудников из снимка структуры', () => {
    it('«Фамилия Имя», пробелы схлопнуты, первое вхождение побеждает', () => {
        const names = userNamesOf([
            {
                USERS: [
                    { ID: 1, NAME: 'Анна', LAST_NAME: 'Иванова' },
                    { ID: '2', NAME: '  Сергей ', LAST_NAME: null },
                ],
            },
            {
                USERS: [
                    { ID: 1, NAME: 'Другая', LAST_NAME: 'Запись' },
                    { ID: 3, LAST_NAME: 'Петров  Сидоров' },
                ],
            },
        ]);
        expect([...names.entries()]).toEqual([
            [1, 'Иванова Анна'],
            [2, 'Сергей'],
            [3, 'Петров Сидоров'],
        ]);
    });

    it('без имени, без id и без списка сотрудников — в карте никого', () => {
        const names = userNamesOf([
            {
                USERS: [
                    { ID: 4 },
                    { NAME: 'Без id' },
                    { ID: 'x', NAME: 'Мусор' },
                ],
            },
            { USERS: null },
            {},
        ]);
        expect(names.size).toBe(0);
    });
});
