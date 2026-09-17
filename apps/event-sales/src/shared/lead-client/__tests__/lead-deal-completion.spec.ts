import { LeadDealCompletion } from '../lead-deal-completion';

type Row = Record<string, unknown>;

/** Портал: наши поля-связи сделки → лид установлены. */
const portal = {
    getEntityFieldByCode: (_entity: string, code: string) =>
        ({
            deal_from_lead_id: { bitrixId: 'DEAL_FROM_LEAD_ID' },
            deal_joined_leads: { bitrixId: 'DEAL_JOINED_LEADS' },
        })[code],
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
} as never;

function makeBitrix(deal: Row | undefined, leads: Record<number, Row>) {
    const calls: { method: string; params: Row }[] = [];
    let nextId = 900;
    const call = (method: string, params: Row): Promise<unknown> => {
        calls.push({ method, params });
        const id = Number(params.id);
        let result: unknown = [];
        if (method === 'crm.deal.get') result = deal;
        else if (method === 'crm.lead.get') result = leads[id];
        else if (method.endsWith('.add')) result = ++nextId;
        else if (method.endsWith('.get')) result = {};
        return Promise.resolve({ result });
    };
    return { bitrix: { api: { call } }, calls };
}

const SETTINGS = {
    linkClient: true,
    companyDepartmentIds: '',
    activitiesLimit: 50,
};

const BARE_LEAD: Row = { ID: '42', TITLE: 'Иван', NAME: 'Иван' };

describe('LeadDealCompletion', () => {
    it('лиды сделки берутся из LEAD_ID и наших полей-связей', () => {
        const { bitrix } = makeBitrix(undefined, {});
        const completion = new LeadDealCompletion(
            bitrix,
            portal,
            'p.ru',
            SETTINGS,
        );

        const ids = completion.leadIdsOf({
            LEAD_ID: '10',
            UF_CRM_DEAL_FROM_LEAD_ID: 'L_11',
            UF_CRM_DEAL_JOINED_LEADS: ['L_11', 'L_12'],
        });

        expect(ids).toEqual([10, 11, 12]);
    });

    it('настройка выключена — клиента не создаём, данные переносим', async () => {
        const { bitrix, calls } = makeBitrix(
            { ID: '100', LEAD_ID: '42' },
            { 42: BARE_LEAD },
        );
        const completion = new LeadDealCompletion(bitrix, portal, 'p.ru', {
            ...SETTINGS,
            linkClient: false,
        });

        const result = await completion.complete(100);

        expect(result.link).toBeNull();
        expect(calls.some(c => c.method === 'crm.contact.add')).toBe(false);
        expect(calls.some(c => c.method === 'crm.lead.get')).toBe(true);
    });

    it('настройка выключена, но вид задан явно (ручка) — клиент создаётся', async () => {
        const { bitrix, calls } = makeBitrix(
            { ID: '100', LEAD_ID: '42' },
            { 42: { ...BARE_LEAD } },
        );
        const completion = new LeadDealCompletion(bitrix, portal, 'p.ru', {
            ...SETTINGS,
            linkClient: false,
        });

        const result = await completion.complete(100, undefined, {
            kind: 'contact',
        });

        expect(result.link?.created).toHaveLength(1);
        expect(calls.some(c => c.method === 'crm.contact.add')).toBe(true);
    });

    it('новая компания сделки видна обогащению', async () => {
        const { bitrix, calls } = makeBitrix(
            { ID: '100', LEAD_ID: '42' },
            { 42: { ...BARE_LEAD, TITLE: 'ООО «Юг»' } },
        );
        const completion = new LeadDealCompletion(
            bitrix,
            portal,
            'p.ru',
            SETTINGS,
        );

        await completion.complete(100, undefined, { kind: 'company' });

        // Обогащение читает компанию сделки — ту, что только что создали.
        const companyReads = calls.filter(
            c => c.method === 'crm.company.get' && c.params.id === 901,
        );
        expect(companyReads.length).toBeGreaterThan(1);
    });

    it('сделка не прочитана — предупреждение, без записи', async () => {
        const { bitrix, calls } = makeBitrix(undefined, {});
        const completion = new LeadDealCompletion(
            bitrix,
            portal,
            'p.ru',
            SETTINGS,
        );

        const result = await completion.complete(100);

        expect(result.warnings).toEqual(['Сделка 100 не прочитана']);
        expect(calls).toHaveLength(1);
    });
});
