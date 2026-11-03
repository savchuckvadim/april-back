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
        leads: [
            { id: 355975, responsibleId: 445 },
            { id: 356071, responsibleId: 447 },
        ],
    };

    it('своя открытая сделка — на сотрудника только те, у кого другой ответственный', () => {
        expect(planDealOwnerAlign(base)).toEqual({
            responsibleId: 447,
            companyId: 55,
            contactIds: [1],
            leadIds: [355975],
        });
    });

    it('лид заявки с другим ответственным — выравнивается и без компании с контактами', () => {
        expect(
            planDealOwnerAlign({
                ...base,
                company: null,
                contacts: [],
                leads: [{ id: 355975, responsibleId: 445 }],
            }),
        ).toEqual({
            responsibleId: 447,
            companyId: null,
            contactIds: [],
            leadIds: [355975],
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
                leads: [{ id: 356071, responsibleId: 447 }],
            }),
        ).toEqual({ skip: 'aligned' });
    });
});

describe('DealOwnerAlignService', () => {
    const FIELDS = {
        dealLeadLinks: ['UF_CRM_DEAL_FROM_LEAD_ID', 'UF_CRM_DEAL_JOINED_LEADS'],
        leadManagerOp: 'UF_CRM_MANAGER_OP',
        leadAssignedAt: 'UF_CRM_OP_LEAD_ASSIGNED_AT',
        timezone: 'Europe/Moscow',
    };
    const setup = (rows: Record<string, unknown>, fields?: typeof FIELDS) => {
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
                fields,
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
            leadsMoved: 0,
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
        // Без полей слепка лиды не читаются вовсе.
        expect(fx.calls.some(call => call.method === 'crm.lead.list')).toBe(
            false,
        );
    });

    /*
     * garant 02.11.2026, сделка 111547: руководитель сменил ответственного
     * сделки в карточке, лид остался на прежнем с таймером принятия. При
     * открытии своей сделки лид переводится на владельца сделки, менеджер
     * идёт вместе с ним, окно принятия стартует заново; сконвертированный
     * лид не трогается.
     */
    it('лиды заявки — на ответственного сделки, с менеджером и новым окном принятия', async () => {
        const fx = setup(
            {
                'crm.deal.get': {
                    ID: '111547',
                    ASSIGNED_BY_ID: '439',
                    COMPANY_ID: '',
                    UF_CRM_DEAL_FROM_LEAD_ID: 'L_355975',
                    UF_CRM_DEAL_JOINED_LEADS: ['L_355975', 'L_300001'],
                },
                'crm.deal.contact.items.get': [],
                'crm.lead.list': [
                    {
                        ID: '355975',
                        ASSIGNED_BY_ID: '445',
                        STATUS_SEMANTIC_ID: 'P',
                        UF_CRM_OP_LEAD_ASSIGNED_AT: '2026-11-02T14:36:01+03:00',
                    },
                    {
                        ID: '300001',
                        ASSIGNED_BY_ID: '445',
                        STATUS_SEMANTIC_ID: 'S',
                    },
                ],
                batch: { result: { lead_355975: true }, result_error: [] },
            },
            FIELDS,
        );

        const result = await fx.service.align(111547, 439);

        expect(result).toEqual({
            responsibleId: 439,
            skipped: null,
            companyMoved: false,
            contactsMoved: 0,
            leadsMoved: 1,
            warnings: [],
        });
        const leadList = fx.calls.find(call => call.method === 'crm.lead.list')
            ?.params as { filter: Record<string, unknown> };
        expect(leadList.filter).toEqual({ '@ID': [355975, 300001] });
        const batch = fx.calls.find(call => call.method === 'batch')
            ?.params as { cmd: Record<string, string> };
        expect(Object.keys(batch.cmd)).toEqual(['lead_355975']);
        // Дата таймера в локали портала; пробел и двоеточия кодирует пачка.
        expect(batch.cmd.lead_355975).toMatch(
            /^crm\.lead\.update\?id=355975&fields\[ASSIGNED_BY_ID\]=439&fields\[UF_CRM_MANAGER_OP\]=439&fields\[UF_CRM_OP_LEAD_ASSIGNED_AT\]=\d{2}\.\d{2}\.\d{4}%20\d{2}%3A\d{2}%3A\d{2}$/,
        );
    });

    it('лид уже принят (таймер снят) — переводится без нового окна принятия', async () => {
        const fx = setup(
            {
                'crm.deal.get': {
                    ID: '111547',
                    ASSIGNED_BY_ID: '439',
                    COMPANY_ID: '',
                    UF_CRM_DEAL_FROM_LEAD_ID: 'L_355975',
                },
                'crm.deal.contact.items.get': [],
                'crm.lead.list': [
                    {
                        ID: '355975',
                        ASSIGNED_BY_ID: '445',
                        STATUS_SEMANTIC_ID: 'P',
                        UF_CRM_OP_LEAD_ASSIGNED_AT: '',
                    },
                ],
                batch: { result: { lead_355975: true }, result_error: [] },
            },
            FIELDS,
        );

        const result = await fx.service.align(111547, 439);

        expect(result?.leadsMoved).toBe(1);
        const batch = fx.calls.find(call => call.method === 'batch')
            ?.params as { cmd: Record<string, string> };
        expect(batch.cmd.lead_355975).toBe(
            'crm.lead.update?id=355975&fields[ASSIGNED_BY_ID]=439&fields[UF_CRM_MANAGER_OP]=439',
        );
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
