import {
    IInnRequisiteBitrix,
    InnRequisiteReader,
} from '../inn-requisite.reader';

/**
 * Отказ в правах на реквизиты (26.10.2026): ядро бросает ошибку axios, и
 * «Access denied» лежит в теле ответа. Раньше читатель смотрел только
 * `error.message`, память об отказе не срабатывала, и каждое открытие
 * сделки снова ходило в Битрикс за заведомым отказом.
 */
const accessDenied = () =>
    Object.assign(new Error('Request failed with status code 403'), {
        response: {
            data: {
                error: 'ACCESS_DENIED',
                error_description: 'Access denied',
            },
        },
    });

const setup = (failure: () => Error) => {
    const counter = { requisite: 0, link: 0 };
    const bitrix = {
        api: { call: () => Promise.resolve({ result: [] }) },
        requisite: {
            getList: () => {
                counter.requisite += 1;
                return Promise.reject(failure());
            },
        },
        requisiteLink: {
            getList: () => {
                counter.link += 1;
                return Promise.reject(failure());
            },
        },
        requisitePreset: { getList: () => Promise.resolve({ result: [] }) },
    } as unknown as IInnRequisiteBitrix;
    return { bitrix, counter };
};

const owners = { companyId: 55, companyTitle: 'ООО «Ромашка»', contacts: [] };

describe('InnRequisiteReader — отказ в правах', () => {
    it('отказ из тела ответа запоминается: второе открытие в Битрикс не ходит', async () => {
        const { bitrix, counter } = setup(accessDenied);
        const reader = new InnRequisiteReader(bitrix, 'denied-1.bitrix24.ru');

        expect(await reader.cards(owners)).toEqual({
            cards: [],
            readable: false,
        });
        expect(await reader.cards(owners)).toEqual({
            cards: [],
            readable: false,
        });
        expect(await reader.linkedRequisiteId(100)).toBe(0);
        expect(counter).toEqual({ requisite: 1, link: 0 });
    });

    it('отказ на привязке реквизита тоже запоминается', async () => {
        const { bitrix, counter } = setup(accessDenied);
        const reader = new InnRequisiteReader(bitrix, 'denied-2.bitrix24.ru');

        expect(await reader.linkedRequisiteId(100)).toBe(0);
        expect((await reader.cards(owners)).readable).toBe(false);
        expect(counter).toEqual({ requisite: 0, link: 1 });
    });

    it('другая ошибка не запоминается: следующий вызов снова читает', async () => {
        const { bitrix, counter } = setup(() => new Error('socket hang up'));
        const reader = new InnRequisiteReader(bitrix, 'flaky.bitrix24.ru');

        await reader.cards(owners);
        await reader.cards(owners);
        expect(counter.requisite).toBe(2);
    });
});
