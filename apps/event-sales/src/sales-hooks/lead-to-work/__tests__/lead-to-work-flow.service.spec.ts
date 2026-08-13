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
    // Воронки для инварианта «одна открытая пара»: fail-стадии есть.
    getDealCategoryByCode: (code: string) => {
        if (code === 'sales_base') {
            return {
                bitrixId: '3',
                stages: [
                    { code: 'sales_cold', bitrixId: 'COLD' },
                    { code: 'sales_fail', bitrixId: 'LOSE' },
                ],
            };
        }
        if (code === 'sales_xo') {
            return {
                bitrixId: '7',
                stages: [
                    { code: 'cold_plan', bitrixId: 'PLAN' },
                    { code: 'cold_fail', bitrixId: 'XLOSE' },
                ],
            };
        }
        return undefined;
    },
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
    fromLeadDeals: [],
    openTasks: [],
    contactIds: [],
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

/**
 * Событийные поля ХО установлены на всех трёх сущностях — как на портале,
 * где классический холодный обзвон их и пишет.
 */
const XO_EVENT_FIELDS = {
    ...FIELDS,
    ...Object.fromEntries(
        (
            [
                ['xo_name', 'XO_NAME'],
                ['xo_date', 'XO_DATE'],
                ['xo_responsible', 'XO_RESPONSIBLE'],
                ['xo_created', 'XO_CREATED'],
                ['manager_op', 'MANAGER_OP'],
                ['call_next_date', 'CALL_NEXT_DATE'],
                ['call_next_name', 'CALL_NEXT_NAME'],
                ['call_last_date', 'CALL_LAST_DATE'],
                ['op_history', 'OP_HISTORY'],
                ['op_mhistory', 'OP_MHISTORY'],
                ['op_current_status', 'OP_CURRENT_STATUS'],
            ] as const
        ).flatMap(([code, bitrixId]) =>
            (['lead', 'company', 'deal'] as const).map(entity => [
                `${entity}:${code}`,
                { bitrixId },
            ]),
        ),
    ),
};

describe('LeadToWorkFlowService', () => {
    /*
     * Инвариант «одна открытая пара»: повторные прогоны не должны копить
     * сделки. Кандидаты собираются из to_base_sales, deal_from_lead_id и
     * LEAD_ID; главной становится последняя открытая, лишние открытые
     * закрываются в fail своей воронки; закрытые не трогаются.
     */
    it('лишние ОТКРЫТЫЕ сделки лида закрываются в fail, работа идёт по последней', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new LeadToWorkFlowService(
            bitrix as never,
            makePortal(FIELDS) as never,
        );

        const plan = service.queue(
            makeItem({ leadId: 42, responsible: 5, isXo: 'Y' }),
            baseContext({
                // Три сделки ОП: две открытые (100, 300) и одна закрытая (200).
                fromLeadDeals: [
                    { ID: '100', CATEGORY_ID: '3', CLOSED: 'N' },
                    { ID: '200', CATEGORY_ID: '3', CLOSED: 'Y' },
                    { ID: '300', CATEGORY_ID: '3', CLOSED: 'N' },
                    // Плюс две ХО: обе открытые.
                    { ID: '410', CATEGORY_ID: '7', CLOSED: 'N' },
                    { ID: '420', CATEGORY_ID: '7', CLOSED: 'N' },
                ] as never,
            }),
            basePlan({ xoCategoryId: '7', xoStageId: 'C7:PLAN' }),
            makeBuffer() as never,
        );

        // Закрыты ровно лишние открытые: 100 (ОП) и 410 (ХО).
        const closed = calls
            .filter(c => c.cmd.startsWith('lw_close_extra_'))
            .map(c => ({
                dealId: c.args[0],
                stage: (c.args[1] as Record<string, unknown>).STAGE_ID,
            }));
        expect(closed).toEqual([
            { dealId: 100, stage: 'C3:LOSE' },
            { dealId: 410, stage: 'C7:XLOSE' },
        ]);
        expect(plan.extraDealsClosed).toBe(2);

        // Новая пара НЕ создаётся: работа идёт по последним открытым.
        expect(calls.some(c => c.method === 'deal.set')).toBe(false);
        expect(plan.reused).toBe(true);
        const updated = calls
            .filter(c => c.method === 'deal.update' && !c.cmd.includes('close'))
            .map(c => c.args[0]);
        expect(updated).toContain(300);
        expect(updated).toContain(420);
    });

    it('ХО-ветка пишет событийные поля обзвона на лид, компанию и обе сделки', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new LeadToWorkFlowService(
            bitrix as never,
            makePortal(XO_EVENT_FIELDS) as never,
        );

        service.queue(
            makeItem({
                leadId: 42,
                responsible: 5,
                isXo: 'Y',
                deadline: '15.08.2026 10:00:00',
            }),
            baseContext({ company: { ID: '7', TITLE: 'Ромашка' } as never }),
            basePlan({ xoCategoryId: '7', xoStageId: 'C7:PLAN' }),
            makeBuffer() as never,
            900, // автор операции → xo_created
        );

        const fieldsOf = (method: string) =>
            (calls.find(c => c.method === method)?.args.at(-1) ?? {}) as Record<
                string,
                unknown
            >;

        // Компания: дата обзвона, ответственный, постановщик, текущий статус.
        const company = fieldsOf('company.update');
        expect(company.UF_CRM_XO_DATE).toBe('15.08.2026 10:00:00');
        expect(company.UF_CRM_XO_RESPONSIBLE).toBe('5');
        expect(company.UF_CRM_XO_CREATED).toBe('900');
        expect(company.UF_CRM_OP_CURRENT_STATUS).toContain('Холодный обзвон');

        // Основная и ХО-сделки получают тот же набор.
        const baseDeal = fieldsOf('deal.set');
        expect(baseDeal.UF_CRM_XO_DATE).toBe('15.08.2026 10:00:00');
        expect(baseDeal.UF_CRM_CALL_NEXT_DATE).toBe('15.08.2026 10:00:00');

        // Лид: событийные поля + история обзвона (multiple, свежая первой).
        const lead = fieldsOf('lead.update');
        expect(lead.UF_CRM_XO_NAME).toBe('ООО Ромашка (заявка)');
        expect(lead.UF_CRM_MANAGER_OP).toBe('5');
        const mhistory = lead.UF_CRM_OP_MHISTORY as string[];
        expect(mhistory[0]).toContain('ХО: ООО Ромашка (заявка)');
    });

    it('конвертация (isXo=N) событийные поля ХО НЕ пишет', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new LeadToWorkFlowService(
            bitrix as never,
            makePortal(XO_EVENT_FIELDS) as never,
        );

        service.queue(
            makeItem({
                leadId: 42,
                responsible: 5,
                deadline: '15.08.2026 10:00:00',
            }),
            baseContext(),
            basePlan(),
            makeBuffer() as never,
        );

        const dealFields = calls.find(c => c.method === 'deal.set')
            ?.args[0] as Record<string, unknown>;
        expect(dealFields.UF_CRM_XO_DATE).toBeUndefined();
        expect(dealFields.UF_CRM_OP_CURRENT_STATUS).toBeUndefined();
    });

    /*
     * Контакты лида — то, по чему звонят. При переходе в работу они обязаны
     * переехать на сделку целиком: главный в CONTACT_ID, все в CONTACT_IDS.
     */
    it('контакты лида переезжают на основную и ХО-сделку', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new LeadToWorkFlowService(
            bitrix as never,
            makePortal(FIELDS) as never,
        );

        service.queue(
            makeItem({ leadId: 42, responsible: 5, isXo: 'Y' }),
            baseContext({ contactIds: [11, 22] }),
            basePlan({ xoCategoryId: '7', xoStageId: 'C7:PLAN' }),
            makeBuffer() as never,
        );

        const dealSets = calls.filter(c => c.method === 'deal.set');
        expect(dealSets).toHaveLength(2); // основная + ХО
        for (const call of dealSets) {
            const fields = call.args[0] as Record<string, unknown>;
            expect(fields.CONTACT_ID).toBe('11');
            expect(fields.CONTACT_IDS).toEqual([11, 22]);
        }
    });

    it('reuse: контакты лида добавляются к уже привязанным (union)', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new LeadToWorkFlowService(
            bitrix as never,
            makePortal(FIELDS) as never,
        );

        service.queue(
            makeItem({ leadId: 42, responsible: 5 }),
            baseContext({
                existingOurDeal: {
                    ID: '300',
                    CATEGORY_ID: '3',
                    CONTACT_IDS: ['99'],
                } as never,
                contactIds: [11],
            }),
            basePlan(),
            makeBuffer() as never,
        );

        const update = calls.find(c => c.cmd === 'lw_deal_upd_42');
        const fields = update?.args[1] as Record<string, unknown>;
        expect(fields.CONTACT_IDS).toEqual([99, 11]);
    });

    it('флаг робота isRequest=Y делает лид заявкой без полей лидогена', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new LeadToWorkFlowService(
            bitrix as never,
            makePortal(FIELDS, true) as never,
        );

        const plan = service.queue(
            makeItem({
                leadId: 42,
                responsible: 5,
                isXo: 'Y',
                isRequest: 'Y',
            }),
            baseContext(),
            basePlan({ xoCategoryId: '7', xoStageId: 'C7:PLAN' }),
            makeBuffer() as never,
        );

        expect(plan.isRequest).toBe(true);
        const taskAdd = calls.find(c => c.method === 'task.add');
        const title = (taskAdd?.args[0] as Record<string, unknown>).TITLE;
        expect(String(title)).toContain('Заявка.');
    });

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
        // Определения полей не прочитаны → дефолт с префиксом (инсталлер по
        // умолчанию включает все типы, там формат `D_{id}`).
        expect(leadFields.UF_CRM_TO_BASE_SALES).toBe(
            `D_$result[${dealSet?.cmd}]`,
        );
        expect(leadFields.UF_CRM_OP_LEAD_STATUS).toBe(401);
        expect(leadFields.UF_CRM_OP_LEAD_IS_COMPANY).toBeUndefined();
        // Конвертационная ветка KPI не пишет.
        expect(plan.kpiPlanned).toBe(false);
        expect(calls.some(c => c.method === 'listItem.add')).toBe(false);
    });

    /*
     * Формат значения crm-поля диктует САМ Битрикс: поле с единственным
     * разрешённым типом хранит голый id и молча отбрасывает `D_123`, поле с
     * несколькими типами — наоборот. Поэтому формат берётся из фактических
     * привязок поля портала, а не из нашей константы.
     */
    it('to_base_sales с ОДНИМ разрешённым типом получает голый id (без D_)', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new LeadToWorkFlowService(
            bitrix as never,
            makePortal(FIELDS) as never,
            { UF_CRM_TO_BASE_SALES: { itemNames: {}, crmTypes: ['DEAL'] } },
        );

        service.queue(
            makeItem({ leadId: 42, responsible: 5 }),
            baseContext(),
            basePlan(),
            makeBuffer() as never,
        );

        const dealSet = calls.find(c => c.method === 'deal.set');
        const leadFields = calls.find(c => c.method === 'lead.update')
            ?.args[1] as Record<string, unknown>;
        expect(leadFields.UF_CRM_TO_BASE_SALES).toBe(
            `$result[${dealSet?.cmd}]`,
        );
    });

    it('to_base_sales с НЕСКОЛЬКИМИ типами получает ссылку с префиксом D_', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new LeadToWorkFlowService(
            bitrix as never,
            makePortal(FIELDS) as never,
            {
                UF_CRM_TO_BASE_SALES: {
                    itemNames: {},
                    crmTypes: ['LEAD', 'DEAL'],
                },
            },
        );

        service.queue(
            makeItem({ leadId: 42, responsible: 5 }),
            baseContext(),
            basePlan(),
            makeBuffer() as never,
        );

        const dealSet = calls.find(c => c.method === 'deal.set');
        const leadFields = calls.find(c => c.method === 'lead.update')
            ?.args[1] as Record<string, unknown>;
        expect(leadFields.UF_CRM_TO_BASE_SALES).toBe(
            `D_$result[${dealSet?.cmd}]`,
        );
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
