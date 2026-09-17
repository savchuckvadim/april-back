import {
    LeadClientKindResolver,
    looksLikeOrganization,
} from '../lead-client-kind';

type Row = Record<string, unknown>;

/** Отделы: 1 — компания, 20 — Ростов, 21 — группа Ростова, 30 — Воронеж. */
function makeBitrix(userDepartment: Record<number, number[]>) {
    const calls: string[] = [];
    const call = (method: string, params: Row): Promise<unknown> => {
        calls.push(method);
        if (method === 'department.get') {
            return Promise.resolve({
                result: [
                    { ID: '1' },
                    { ID: '20', PARENT: '1' },
                    { ID: '21', PARENT: '20' },
                    { ID: '30', PARENT: '1' },
                ],
            });
        }
        const id = Number(params.ID);
        return Promise.resolve({
            result: [
                { ID: String(id), UF_DEPARTMENT: userDepartment[id] ?? [] },
            ],
        });
    };
    return { bitrix: { api: { call } }, calls };
}

const ORG_LEAD: Row = { TITLE: 'АКЦИОНЕРНОЕ ОБЩЕСТВО "ЮГ РУСИ"' };
const PERSON_LEAD: Row = {
    TITLE: 'Кучин Владимир Владимирович',
    NAME: 'Владимир',
};

describe('looksLikeOrganization', () => {
    it.each([
        ['ООО «Ромашка»'],
        ['БДОУ г. Омска Детский сад № 128'],
        ['Адвокатский кабинет Махиня Олеси Олеговны'],
        ['Городская поликлиника № 46'],
    ])('«%s» — организация', title => {
        expect(looksLikeOrganization({ TITLE: title })).toBe(true);
    });

    it.each([['Снежана Котова'], ['Татьяна юрист'], ['Лид #347931']])(
        '«%s» — не организация',
        title => {
            expect(looksLikeOrganization({ TITLE: title })).toBe(false);
        },
    );

    it('«Компания» или ИНН в лиде — организация при любом названии', () => {
        expect(
            looksLikeOrganization({ TITLE: 'Иван', COMPANY_TITLE: 'Вектор' }),
        ).toBe(true);
        expect(
            looksLikeOrganization({ TITLE: 'Иван', UF_CRM_INN: '7707083893' }, [
                'UF_CRM_INN',
            ]),
        ).toBe(true);
    });

    it('ИП и АО отдельным словом, а не частью слова', () => {
        expect(looksLikeOrganization({ TITLE: 'ИП Сидоров' })).toBe(true);
        expect(looksLikeOrganization({ TITLE: 'Липатова Анна' })).toBe(false);
    });
});

describe('LeadClientKindResolver', () => {
    it('настройка пуста — всегда контакт, Битрикс не спрашиваем', async () => {
        const { bitrix, calls } = makeBitrix({ 7: [20] });
        const resolver = new LeadClientKindResolver(bitrix, '');

        await expect(resolver.resolve(ORG_LEAD, 7)).resolves.toBe('contact');
        expect(calls).toEqual([]);
    });

    it('отдел компаний и лид-организация — компания', async () => {
        const { bitrix } = makeBitrix({ 7: [20] });
        const resolver = new LeadClientKindResolver(bitrix, '20');

        await expect(resolver.resolve(ORG_LEAD, 7)).resolves.toBe('company');
    });

    it('подотдел наследует настройку родителя', async () => {
        const { bitrix } = makeBitrix({ 8: [21] });
        const resolver = new LeadClientKindResolver(bitrix, '20');

        await expect(resolver.resolve(ORG_LEAD, 8)).resolves.toBe('company');
    });

    it('ФИО-лид в отделе компаний остаётся контактом', async () => {
        const { bitrix } = makeBitrix({ 7: [20] });
        const resolver = new LeadClientKindResolver(bitrix, '20');

        await expect(resolver.resolve(PERSON_LEAD, 7)).resolves.toBe('contact');
    });

    it('другой отдел — контакт', async () => {
        const { bitrix } = makeBitrix({ 9: [30] });
        const resolver = new LeadClientKindResolver(bitrix, '20');

        await expect(resolver.resolve(ORG_LEAD, 9)).resolves.toBe('contact');
    });

    it('отделы и сотрудник читаются один раз на прогон', async () => {
        const { bitrix, calls } = makeBitrix({ 7: [20] });
        const resolver = new LeadClientKindResolver(bitrix, '20');

        await resolver.resolve(ORG_LEAD, 7);
        await resolver.resolve(ORG_LEAD, 7);

        expect(calls.filter(m => m === 'department.get')).toHaveLength(1);
        expect(calls.filter(m => m === 'user.get')).toHaveLength(1);
    });
});
