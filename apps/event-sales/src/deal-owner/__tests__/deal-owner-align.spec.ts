import { planDealOwnerAlign } from '../lib/deal-owner-align.plan';
import { DealOwnerAlignService } from '../services/deal-owner-align.service';

type Row = Record<string, unknown>;

describe('planDealOwnerAlign', () => {
    const base = {
        userId: 447,
        dealResponsibleId: 447,
        closed: false,
        company: { id: 55, responsibleId: 331 },
        contacts: [
            { id: 1, responsibleId: 331 },
            { id: 2, responsibleId: 447 },
        ],
    };

    it('своя открытая сделка — на сотрудника только те, у кого другой ответственный', () => {
        expect(planDealOwnerAlign(base)).toEqual({
            responsibleId: 447,
            companyId: 55,
            contactIds: [1],
        });
    });

    it('чужая сделка — клиента не забираем', () => {
        expect(planDealOwnerAlign({ ...base, userId: 445 })).toEqual({
            skip: 'not_own',
        });
    });

    it('закрытая сделка — не трогаем', () => {
        expect(planDealOwnerAlign({ ...base, closed: true })).toEqual({
            skip: 'closed',
        });
    });

    it('всё уже на сотруднике — нечего делать', () => {
        expect(
            planDealOwnerAlign({
                ...base,
                company: { id: 55, responsibleId: 447 },
                contacts: [{ id: 2, responsibleId: 447 }],
            }),
        ).toEqual({ skip: 'aligned' });
    });
});

describe('DealOwnerAlignService', () => {
    const setup = (rows: Record<string, unknown>) => {
        const calls: { method: string; params: Row }[] = [];
        const bitrix = {
            api: {
                call: (method: string, params: Row): Promise<unknown> => {
                    calls.push({ method, params });
                    return Promise.resolve({ result: rows[method] ?? true });
                },
            },
        };
        return {
            calls,
            service: new DealOwnerAlignService(
                bitrix as never,
                'portal.bitrix24.ru',
            ),
        };
    };

    it('переводит компанию и контакты сделки и компании одним batch', async () => {
        const fx = setup({
            'crm.deal.get': {
                ID: '100',
                ASSIGNED_BY_ID: '447',
                COMPANY_ID: '55',
            },
            'crm.company.get': { ID: '55', ASSIGNED_BY_ID: '331' },
            'crm.deal.contact.items.get': [{ CONTACT_ID: '1' }],
            'crm.company.contact.items.get': [
                { CONTACT_ID: '1' },
                { CONTACT_ID: '2' },
            ],
            'crm.contact.list': [
                { ID: '1', ASSIGNED_BY_ID: '331' },
                { ID: '2', ASSIGNED_BY_ID: '447' },
            ],
            batch: { result: { contact_1: true }, result_error: [] },
        });

        const result = await fx.service.align(100, 447);

        expect(result).toEqual({
            responsibleId: 447,
            skipped: null,
            companyMoved: true,
            contactsMoved: 1,
            warnings: [],
        });
        expect(
            fx.calls.find(call => call.method === 'crm.company.update')?.params,
        ).toEqual({ id: 55, fields: { ASSIGNED_BY_ID: 447 } });
        const batch = fx.calls.find(call => call.method === 'batch')
            ?.params as {
            cmd: Record<string, string>;
        };
        expect(batch.cmd).toEqual({
            contact_1: 'crm.contact.update?id=1&fields[ASSIGNED_BY_ID]=447',
        });
    });

    it('чужая сделка — после чтения сделки больше ни одного запроса', async () => {
        const fx = setup({
            'crm.deal.get': {
                ID: '100',
                ASSIGNED_BY_ID: '331',
                COMPANY_ID: '55',
            },
        });

        const result = await fx.service.align(100, 447);

        expect(result?.skipped).toBe('not_own');
        expect(fx.calls.map(call => call.method)).toEqual(['crm.deal.get']);
    });

    it('сделки нет — null', async () => {
        const fx = setup({ 'crm.deal.get': null });
        expect(await fx.service.align(100, 447)).toBeNull();
    });
});
