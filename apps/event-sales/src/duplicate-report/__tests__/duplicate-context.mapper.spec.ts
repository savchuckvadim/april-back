import { ETimeZone } from '@lib/shared/lib/date';
import {
    clientCaptions,
    isFilled,
    openTasksOf,
    rowsOf,
    toDuplicateLead,
} from '../lib/duplicate-context.mapper';

const MSK = ETimeZone.EUROPE_MOSCOW;

describe('разбор строк Битрикса для отчёта по дублям', () => {
    it('открытые задачи с ответственным: «в работе» и «ждёт контроля» в счёт, отложенные и мусор — нет', () => {
        expect(
            openTasksOf({
                tasks: [
                    { id: '1', status: '1', responsibleId: '11' },
                    { id: '2', status: '4', responsibleId: '12' },
                    { id: '3', status: '6', responsibleId: '11' },
                    { ID: '4', STATUS: '3', RESPONSIBLE_ID: '13' },
                    { id: '0', status: '2' },
                    null,
                ],
            }),
        ).toEqual([
            { id: 1, responsibleId: 11 },
            { id: 2, responsibleId: 12 },
            { id: 4, responsibleId: 13 },
        ]);
        expect(openTasksOf([{ id: '1', status: '2' }])).toEqual([
            { id: 1, responsibleId: null },
        ]);
        expect(openTasksOf(null)).toEqual([]);
    });

    it('строки ответа: не массив — пусто, пустые элементы отброшены', () => {
        expect(rowsOf({ ID: 1 })).toEqual([]);
        expect(rowsOf([{ ID: 1 }, null, 'x'])).toEqual([{ ID: 1 }]);
    });

    it('заполненность поля: пусто и «0» — нет, список — по элементам', () => {
        expect(isFilled('')).toBe(false);
        expect(isFilled('0')).toBe(false);
        expect(isFilled(123)).toBe(true);
        expect(isFilled(['', '5'])).toBe(true);
        expect(isFilled({ value: 1 })).toBe(false);
    });

    it('подписи: компания без названия и контакт без имени — честный запасной вариант', () => {
        const { titles, inns } = clientCaptions(
            [{ ID: '100', TITLE: '' }, { ID: 'x' }],
            [{ ID: '7' }],
            'UF_CRM_OP_INN',
        );
        expect(titles.get('company:100')).toBe('Компания 100');
        expect(titles.get('contact:7')).toBe('Контакт 7');
        expect(inns.size).toBe(0);
    });

    it('лид: без id — null, неизвестный источник — без подписи кода', () => {
        expect(
            toDuplicateLead({ TITLE: 'x' }, new Map(), null, MSK),
        ).toBeNull();
        expect(
            toDuplicateLead(
                { ID: '5', SOURCE_ID: '17', DATE_CREATE: '' },
                new Map(),
                null,
                MSK,
            ),
        ).toEqual({
            id: 5,
            title: '',
            createdAt: null,
            sourceName: '',
            isRequest: false,
        });
    });
});
