import { LeadToWorkFlowService } from '../services/lead-to-work-flow.service';
import {
    buildLeadToWorkItem,
    ResolvedLeadToWorkItem,
} from '../dto/lead-to-work.dto';
import { LeadToWorkContext } from '../services/lead-to-work-context.service';
import { LeadToWorkStagePlan } from '../services/lead-to-work-stage.resolver';

/** Буфер-шпион: выполняет enqueue сразу, чтобы читать команды из bitrix-мока. */
const makeBuffer = () => ({
    queue: jest.fn((enqueue: () => void) => enqueue()),
    endGroup: jest.fn().mockResolvedValue(undefined),
    flush: jest.fn().mockResolvedValue(undefined),
    getResults: jest.fn().mockReturnValue([]),
    getCurrentGroupSize: jest.fn().mockReturnValue(0),
    getBufferSize: jest.fn().mockReturnValue(0),
});

const makeBitrix = () => {
    const calls: { method: string; cmd: string; args: unknown[] }[] = [];
    const record =
        (method: string) =>
        (cmd: string, ...args: unknown[]) =>
            calls.push({ method, cmd, args });
    return {
        calls,
        bitrix: {
            batch: {
                company: {
                    set: record('company.set'),
                    update: record('company.update'),
                },
                deal: {
                    set: record('deal.set'),
                    update: record('deal.update'),
                },
                lead: { update: record('lead.update') },
                task: {
                    add: record('task.add'),
                    update: record('task.update'),
                    complete: record('task.complete'),
                },
                listItem: { add: record('listItem.add') },
            },
        },
    };
};

/** Мини-список KPI: код поля собирается как `${group}_${type}_${code}`. */
const makeKpiList = (type: 'kpi' | 'history') => ({
    type,
    group: 'sales',
    bitrixId: type === 'kpi' ? 55 : 56,
    bitrixfields: [
        { code: `sales_${type}_event_title`, bitrixCamelId: 'P_TITLE' },
        { code: `sales_${type}_responsible`, bitrixCamelId: 'P_RESP' },
        {
            code: `sales_${type}_event_action`,
            bitrixCamelId: 'P_ACTION',
            items: [
                { code: 'plan', bitrixId: 1 },
                { code: 'expired', bitrixId: 3 },
            ],
        },
    ],
});

const makePortal = (
    fields: Record<
        string,
        { bitrixId: string; items?: { code: string; bitrixId: number }[] }
    >,
    withKpiLists = false,
) => ({
    getEntityFieldByCode: (entity: string, code: string) => {
        const field = fields[`${entity}:${code}`];
        return field
            ? { bitrixId: field.bitrixId, items: field.items ?? [] }
            : undefined;
    },
    getFieldBitrixId: (field: { bitrixId: string }) =>
        field.bitrixId.startsWith('UF_')
            ? field.bitrixId
            : `UF_CRM_${field.bitrixId}`,
    getSalesTaskGroupId: () => 77,
    getTimezone: () => 'Europe/Moscow',
    getListByCode: (code: string) => {
        if (!withKpiLists) return undefined;
        if (code === 'sales_kpi') return makeKpiList('kpi');
        if (code === 'sales_history') return makeKpiList('history');
        return undefined;
    },
});

const baseContext = (
    over: Partial<LeadToWorkContext> = {},
): LeadToWorkContext => ({
    lead: { ID: '42', TITLE: 'ООО Ромашка (заявка)' } as never,
    company: null,
    existingOurDeal: null,
    existingXoDeal: null,
    convertedDeals: [],
    openTasks: [],
    isConverted: false,
    warnings: [],
    ...over,
});

const basePlan = (
    over: Partial<LeadToWorkStagePlan> = {},
): LeadToWorkStagePlan => ({
    dealCategoryId: '3',
    dealStageId: 'C3:COLD',
    warnings: [],
    ...over,
});

/** Flow работает с уже разрезолвленным ответственным. */
const makeItem = (
    input: Parameters<typeof buildLeadToWorkItem>[0],
): ResolvedLeadToWorkItem =>
    buildLeadToWorkItem(input) as ResolvedLeadToWorkItem;

const FIELDS = {
    'deal:deal_from_lead_id': { bitrixId: 'DEAL_FROM_LEAD_ID' },
    'deal:deal_joined_leads': { bitrixId: 'DEAL_JOINED_LEADS' },
    'lead:to_base_sales': { bitrixId: 'TO_BASE_SALES' },
    'lead:op_lead_is_company': { bitrixId: 'OP_LEAD_IS_COMPANY' },
    'lead:op_lead_status': {
        bitrixId: 'OP_LEAD_STATUS',
        items: [
            { code: 'op_lead_status_four', bitrixId: 401 },
            { code: 'op_lead_status_five', bitrixId: 501 },
        ],
    },
};

describe('LeadToWorkFlowService', () => {
    it('без компании: сделка называется названием лида, связи графа записаны', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new LeadToWorkFlowService(
            bitrix as never,
            makePortal(FIELDS) as never,
        );

        const plan = service.queue(
            makeItem({ leadId: 42, responsible: 5 }),
            baseContext(),
            basePlan(),
            makeBuffer() as never,
        );

        const dealSet = calls.find(c => c.method === 'deal.set');
        const fields = dealSet?.args[0] as Record<string, unknown>;
        expect(fields.TITLE).toBe('ООО Ромашка (заявка)');
        expect(fields.COMPANY_ID).toBeUndefined();
        expect(fields.UF_CRM_DEAL_FROM_LEAD_ID).toBe('L_42');
        expect(fields.UF_CRM_DEAL_JOINED_LEADS).toEqual(['L_42']);
        expect(plan.reused).toBe(false);

        // Лид: обратная ссылка через $result + статус-item «Работа со сделкой».
        const leadUpdate = calls.find(c => c.method === 'lead.update');
        const leadFields = leadUpdate?.args[1] as Record<string, unknown>;
        expect(leadFields.UF_CRM_TO_BASE_SALES).toBe(
            `D_$result[${dealSet?.cmd}]`,
        );
        expect(leadFields.UF_CRM_OP_LEAD_STATUS).toBe(401);
        expect(leadFields.UF_CRM_OP_LEAD_IS_COMPANY).toBeUndefined();
        // Конвертационная ветка KPI не пишет.
        expect(plan.kpiPlanned).toBe(false);
        expect(calls.some(c => c.method === 'listItem.add')).toBe(false);
    });

    it('компания из лида берётся за основу; создание — только по флагу Y', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new LeadToWorkFlowService(
            bitrix as never,
            makePortal(FIELDS) as never,
        );

        service.queue(
            makeItem({ leadId: 42, responsible: 5 }),
            baseContext({ company: { ID: '7', TITLE: 'Ромашка' } as never }),
            basePlan(),
            makeBuffer() as never,
        );
        expect(calls.some(c => c.method === 'company.set')).toBe(false);
        const dealFields = calls.find(c => c.method === 'deal.set')
            ?.args[0] as Record<string, unknown>;
        expect(dealFields.COMPANY_ID).toBe('7');
        const leadFields = calls.find(c => c.method === 'lead.update')
            ?.args[1] as Record<string, unknown>;
        expect(leadFields.UF_CRM_OP_LEAD_IS_COMPANY).toBe(1);
        expect(leadFields.UF_CRM_OP_LEAD_STATUS).toBe(501);
    });

    it('createCompany=Y без компании: company.set + сделка ссылается через $result', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new LeadToWorkFlowService(
            bitrix as never,
            makePortal(FIELDS) as never,
        );

        service.queue(
            makeItem({
                leadId: 42,
                responsible: 5,
                createCompany: 'Y',
            }),
            baseContext(),
            basePlan(),
            makeBuffer() as never,
        );

        const companySet = calls.find(c => c.method === 'company.set');
        expect(companySet).toBeDefined();
        const dealFields = calls.find(c => c.method === 'deal.set')
            ?.args[0] as Record<string, unknown>;
        expect(dealFields.COMPANY_ID).toBe(`$result[${companySet?.cmd}]`);
    });

    it('reuse: вторая сделка не создаётся, deal_joined_leads дополняется union', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new LeadToWorkFlowService(
            bitrix as never,
            makePortal(FIELDS) as never,
        );

        const plan = service.queue(
            makeItem({ leadId: 42, responsible: 5 }),
            baseContext({
                existingOurDeal: {
                    ID: '1024',
                    UF_CRM_DEAL_JOINED_LEADS: ['L_11'],
                } as never,
            }),
            basePlan(),
            makeBuffer() as never,
        );

        expect(plan.reused).toBe(true);
        expect(calls.some(c => c.method === 'deal.set')).toBe(false);
        const dealUpdate = calls.find(c => c.method === 'deal.update');
        const fields = dealUpdate?.args[1] as Record<string, unknown>;
        expect(fields.UF_CRM_DEAL_JOINED_LEADS).toEqual(['L_11', 'L_42']);
        // Конвертационный reuse ответственного НЕ переназначает.
        expect(fields.ASSIGNED_BY_ID).toBeUndefined();
    });

    it('задачи move: идемпотентный префикс «Звонок», GROUP_ID, union UF_CRM_TASK', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new LeadToWorkFlowService(
            bitrix as never,
            makePortal(FIELDS) as never,
        );

        service.queue(
            makeItem({ leadId: 42, responsible: 5 }),
            baseContext({
                openTasks: [
                    {
                        id: 900,
                        title: 'Звонок клиенту',
                        ufCrmTask: ['L_42'],
                    } as never,
                    { id: 901, title: 'Презентация', ufCrmTask: [] } as never,
                ],
            }),
            basePlan(),
            makeBuffer() as never,
        );

        const updates = calls.filter(c => c.method === 'task.update');
        const first = updates[0]?.args[1] as Record<string, unknown>;
        const second = updates[1]?.args[1] as Record<string, unknown>;
        // Уже с префиксом — не дублируется.
        expect(first.TITLE).toBe('Звонок клиенту');
        expect(second.TITLE).toBe('Звонок Презентация');
        expect(first.GROUP_ID).toBe(77);
        expect(first.UF_CRM_TASK).toEqual(
            expect.arrayContaining(['L_42', expect.stringContaining('D_')]),
        );
        // Задачи были — новая не создаётся.
        expect(calls.some(c => c.method === 'task.add')).toBe(false);
    });

    it('isXo=Y: задачи закрываются, новая — «Холодный обзвон», ХО-сделка со связями графа', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new LeadToWorkFlowService(
            bitrix as never,
            makePortal(FIELDS) as never,
        );

        service.queue(
            makeItem({ leadId: 42, responsible: 5, isXo: 'Y' }),
            baseContext({
                openTasks: [{ id: 900, title: 'Старая' } as never],
            }),
            basePlan({ xoCategoryId: '9', xoStageId: 'C9:PLAN' }),
            makeBuffer() as never,
        );

        expect(calls.filter(c => c.method === 'task.complete')).toHaveLength(1);
        const taskAdd = calls.find(c => c.method === 'task.add');
        expect((taskAdd?.args[0] as Record<string, unknown>).TITLE).toContain(
            'Холодный обзвон',
        );
        const dealSets = calls.filter(c => c.method === 'deal.set');
        expect(dealSets).toHaveLength(2); // основная + ХО
        // Связи графа пишутся и на ХО-сделку (правило «у любой связанной»).
        const xoFields = dealSets[1]?.args[0] as Record<string, unknown>;
        expect(xoFields.UF_CRM_DEAL_FROM_LEAD_ID).toBe('L_42');
        expect(xoFields.UF_CRM_DEAL_JOINED_LEADS).toEqual(['L_42']);
    });

    it('isXo=Y при настроенных списках: KPI «Запланирован» в ту же группу', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new LeadToWorkFlowService(
            bitrix as never,
            makePortal(FIELDS, true) as never,
        );

        const plan = service.queue(
            makeItem({ leadId: 42, responsible: 5, isXo: 'Y' }),
            baseContext(),
            basePlan({ xoCategoryId: '9' }),
            makeBuffer() as never,
        );

        expect(plan.kpiPlanned).toBe(true);
        expect(plan.kpiNotHeld).toBe(false);
        const listAdds = calls.filter(c => c.method === 'listItem.add');
        expect(listAdds).toHaveLength(2); // sales_kpi + sales_history
        const fields = (
            listAdds[0]?.args[0] as { FIELDS: Record<string, unknown> }
        ).FIELDS;
        expect(fields.NAME).toContain('Холодный звонок Запланирован');
        expect(fields.NAME).not.toContain('Заявка');
    });

    it('заявка (поле лидогена заполнено): «. Заявка.» в задаче и KPI', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new LeadToWorkFlowService(
            bitrix as never,
            makePortal(FIELDS, true) as never,
        );

        const plan = service.queue(
            makeItem({ leadId: 42, responsible: 5, isXo: 'Y' }),
            baseContext({
                lead: {
                    ID: '42',
                    TITLE: 'ООО Ромашка',
                    UF_CRM_REG_NUMBER: '48-00691',
                } as never,
            }),
            basePlan({ xoCategoryId: '9' }),
            makeBuffer() as never,
        );

        expect(plan.isRequest).toBe(true);
        const taskAdd = calls.find(c => c.method === 'task.add');
        expect((taskAdd?.args[0] as Record<string, unknown>).TITLE).toBe(
            'Холодный обзвон. Заявка. ООО Ромашка',
        );
        const listAdd = calls.find(c => c.method === 'listItem.add');
        const fields = (listAdd?.args[0] as { FIELDS: Record<string, unknown> })
            .FIELDS;
        expect(fields.NAME).toBe(
            'Холодный звонок Запланирован. Заявка. ООО Ромашка',
        );
    });

    it('повторный ХО: ХО-сделка передаётся, всё — новому, прежнему KPI «Не состоялся»', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new LeadToWorkFlowService(
            bitrix as never,
            makePortal(FIELDS, true) as never,
        );

        const plan = service.queue(
            makeItem({ leadId: 42, responsible: 5, isXo: 'Y' }),
            baseContext({
                company: { ID: '7', TITLE: 'Ромашка' } as never,
                existingOurDeal: { ID: '1024', COMPANY_ID: '7' } as never,
                existingXoDeal: {
                    ID: '2048',
                    ASSIGNED_BY_ID: '9',
                } as never,
                openTasks: [
                    {
                        id: 900,
                        title: 'Холодный обзвон Ромашка',
                        responsibleId: 9,
                    } as never,
                ],
            }),
            basePlan(),
            makeBuffer() as never,
        );

        // Вторая ХО-сделка не создаётся — существующая обновляется.
        expect(calls.some(c => c.method === 'deal.set')).toBe(false);
        const xoUpdate = calls.find(
            c => c.method === 'deal.update' && c.cmd === 'lw_xo_upd_42',
        );
        expect(
            (xoUpdate?.args[1] as Record<string, unknown>).ASSIGNED_BY_ID,
        ).toBe('5');
        // Базовая сделка, компания и лид — тоже новому ответственному.
        const baseUpdate = calls.find(
            c => c.method === 'deal.update' && c.cmd === 'lw_deal_upd_42',
        );
        expect(
            (baseUpdate?.args[1] as Record<string, unknown>).ASSIGNED_BY_ID,
        ).toBe('5');
        expect(calls.some(c => c.method === 'company.update')).toBe(true);
        const leadFields = calls.find(c => c.method === 'lead.update')
            ?.args[1] as Record<string, unknown>;
        expect(leadFields.ASSIGNED_BY_ID).toBe('5');
        // Старая задача закрыта, новая — на нового.
        expect(calls.filter(c => c.method === 'task.complete')).toHaveLength(1);

        // KPI: «Не состоялся» прежнему (9) + «Запланирован» новому (5).
        expect(plan.kpiNotHeld).toBe(true);
        expect(plan.kpiPlanned).toBe(true);
        const listAdds = calls.filter(c => c.method === 'listItem.add');
        expect(listAdds).toHaveLength(4); // 2 события × 2 списка
        const names = listAdds.map(
            c => (c.args[0] as { FIELDS: Record<string, unknown> }).FIELDS.NAME,
        );
        expect(names.some(n => String(n).includes('Не состоялся'))).toBe(true);
        expect(names.some(n => String(n).includes('Запланирован'))).toBe(true);
    });

    it('повторный ХО тем же ответственным: «Не состоялся» не пишется', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new LeadToWorkFlowService(
            bitrix as never,
            makePortal(FIELDS, true) as never,
        );

        const plan = service.queue(
            makeItem({ leadId: 42, responsible: 9, isXo: 'Y' }),
            baseContext({
                existingOurDeal: { ID: '1024' } as never,
                existingXoDeal: {
                    ID: '2048',
                    ASSIGNED_BY_ID: '9',
                } as never,
            }),
            basePlan(),
            makeBuffer() as never,
        );

        expect(plan.kpiNotHeld).toBe(false);
        expect(plan.kpiPlanned).toBe(true);
        const listAdds = calls.filter(c => c.method === 'listItem.add');
        expect(listAdds).toHaveLength(2); // только «Запланирован» × 2 списка
    });

    it('неустановленные поля пропускаются молча (graceful), запись не падает', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new LeadToWorkFlowService(
            bitrix as never,
            makePortal({}) as never,
        );

        service.queue(
            makeItem({ leadId: 42, responsible: 5 }),
            baseContext(),
            basePlan(),
            makeBuffer() as never,
        );

        const dealFields = calls.find(c => c.method === 'deal.set')
            ?.args[0] as Record<string, unknown>;
        expect(dealFields.UF_CRM_DEAL_FROM_LEAD_ID).toBeUndefined();
        // Лид без единого поля — update не ставится вовсе.
        expect(calls.some(c => c.method === 'lead.update')).toBe(false);
    });
});
