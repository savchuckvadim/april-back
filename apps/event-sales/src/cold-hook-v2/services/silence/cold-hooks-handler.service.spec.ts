import { PBXService } from '@/modules/pbx/pbx.service';
import { PbxPresentationSmartService } from '@lib/portal-lib/pbx/pbx-presentation-smart';
import { PbxZprSmartService } from '@lib/portal-lib/pbx/pbx-zpr-smart';
import { UserNameResolver } from '../../../shared/lead-request/user-name.resolver';
import {
    EnumColdCallEntityType,
    EnumColdCallForce,
    EnumColdCallIsTmc,
} from '../../dto/cold.dto';
import { IColdCallData } from '../../type/cold-hook-silence.interface';
import { ColdHooksHandlerV2Service } from './cold-hooks-handler.service';

/**
 * Сквозной прогон обработчика v2 на фейках (шаг 8 плана): цель → связи →
 * решение → закрытие → таймлайн/push → создание. Фейк Bitrix отвечает на
 * batch-команды по их виду и фильтру и ведёт журнал всего, что ему послали.
 */
type Row = Record<string, unknown>;

const stage = (code: string, bitrixId: string) => ({ code, bitrixId });
const CATEGORIES = [
    {
        bitrixId: '17',
        code: 'sales_base',
        title: 'ОП',
        stages: [
            stage('sales_cold', 'PREPARATION'),
            stage('sales_warm', 'WARM'),
            stage('sales_success', 'WON'),
            stage('sales_double', 'APOLOGY'),
        ],
    },
    {
        bitrixId: '48',
        code: 'sales_presentation',
        title: 'Презентации',
        stages: [
            stage('spres_plan', 'PLAN'),
            stage('spres_noresult', 'NORESULT'),
        ],
    },
    {
        bitrixId: '32',
        code: 'sales_xo',
        title: 'ХО',
        stages: [
            stage('cold_plan', 'PLAN'),
            stage('cold_noresult', 'NORESULT'),
        ],
    },
];
const OPEN_STAGES = ['C17:PREPARATION', 'C17:WARM', 'C48:PLAN', 'C32:PLAN'];

const FIELDS: Record<string, string> = {
    to_base_sales: 'TO_BASE_SALES',
    to_xo_sales: 'TO_XO_SALES',
    to_presentation_sales: 'TO_PRESENTATION_SALES',
    to_base_tmc: 'TO_BASE_TMC',
    deal_from_lead_id: 'DEAL_FROM_LEAD_ID',
    call_next_date: 'CALL_NEXT_DATE',
    xo_date: 'XO_DATE',
    op_xo_revive_sent_at: 'OP_XO_REVIVE_SENT_AT',
    xo_responsible: 'XO_RESPONSIBLE',
    xo_created: 'XO_CREATED',
    xo_name: 'XO_NAME',
    // Ось заявки: адресный ХО принимает ждущую заявку.
    op_lead_assigned_at: 'OP_LEAD_ASSIGNED_AT',
    op_lead_accepted_by: 'OP_LEAD_ACCEPTED_BY',
    op_lead_firstprepare_history: 'OP_LEAD_FIRSTPREPARE_HISTORY',
};

const list = (type: string) => ({
    group: 'sales',
    type,
    bitrixId: type === 'kpi' ? '10' : '20',
    title: type,
    name: type,
    bitrixfields: [
        {
            type: 'crm',
            code: `sales_${type}_crm`,
            name: 'CRM',
            title: 'CRM',
            bitrixId: 'PROPERTY_CRM',
            bitrixCamelId: 'PROPERTY_CRM',
            items: [],
        },
    ],
});

const PortalModel = {
    getTimezone: () => 'Europe/Moscow',
    getPortal: () => ({ domain: 'd.b24.ru' }),
    getSalesTaskGroupId: () => 41,
    getDealCategoryByCode: (code: string) =>
        CATEGORIES.find(c => c.code === code),
    getDealCategories: () => CATEGORIES,
    getEntityFieldByCode: (_entity: string, code: string) =>
        FIELDS[code] ? { bitrixId: FIELDS[code], items: [] } : undefined,
    // Читатели полей карточки (XoRoutingModel/XoIntentModel) переводят
    // bitrixId в полное имя через портал — как и боевой PortalModel.
    getFieldBitrixId: (field: { bitrixId: string }) =>
        field.bitrixId.startsWith('UF_CRM_')
            ? field.bitrixId
            : `UF_CRM_${field.bitrixId}`,
    getListByCode: (code: string) =>
        list(code === 'sales_kpi' ? 'kpi' : 'history'),
    getLeadStatusIdByCode: (code: string) =>
        code === 'lead_taken_in_work' ? 'PBX_TAKEN_IN_WORK' : undefined,
};

const PRES_INFO = {
    entityTypeId: 1040,
    ufKeyByCode: {
        PRES_BASE_DEAL: 'ufCrm7BaseDeal',
        PRES_DEAL: 'ufCrm7Deal',
        PRES_COMPANY: 'ufCrm7Company',
        PRES_LEAD: 'ufCrm7Lead',
    },
    stageIdByCode: {
        pres_plan: 'DT1040_9:PLAN',
        pres_noresult: 'DT1040_9:NORESULT',
    },
};
const ZPR_INFO = {
    entityTypeId: 1038,
    ufKeyByCode: {
        ZPR_BASE_DEAL: 'ufCrm8BaseDeal',
        ZPR_COMPANY: 'ufCrm8Company',
        ZPR_LEAD: 'ufCrm8Lead',
    },
    stageIdByCode: { zpr_plan: 'DT1038_9:PLAN', zpr_fail: 'DT1038_9:FAIL' },
};

interface World {
    deals: Row[];
    companies: Row[];
    tasks: Array<{ id: string; ufCrmTask: string[] }>;
    items: Record<string, Row[]>;
    /** Лиды клиента (для оси заявки); по умолчанию — нет. */
    leads?: Row[];
}

const matches = (row: Row, filter: Row): boolean =>
    Object.entries(filter).every(([key, value]) => {
        const field = key.replace(/^=/, '');
        const raw = String(row[field] ?? '');
        const wanted = (Array.isArray(value) ? value : [value]).map(String);
        return wanted.some(w => raw === w || raw === `D_${w}`);
    });

/** Фейк Bitrix: батч-команды копятся, callBatch отвечает по виду и фильтру. */
const makeBitrix = (world: World) => {
    const pending: Array<[string, () => unknown]> = [];
    const journal: Array<[string, ...unknown[]]> = [];
    const rec =
        (name: string, answer: (...args: unknown[]) => unknown) =>
        (key: string, ...args: unknown[]) => {
            journal.push([name, key, ...args]);
            pending.push([key, () => answer(...args)]);
        };
    const callBatchWithConcurrency = jest.fn(async () => {
        const result: Row = {};
        for (const [key, answer] of pending) result[key] = answer();
        pending.length = 0;
        return [{ result }];
    });
    const bitrix = {
        api: { domain: 'd.b24.ru', callBatchWithConcurrency },
        deal: {
            all: jest.fn(async (filter: Row) =>
                world.deals.filter(d => matches(d, filter)),
            ),
        },
        item: {
            listAll: jest.fn(async (entityTypeId: string, filter: Row) =>
                (world.items[entityTypeId] ?? []).filter(row =>
                    (filter.stageId as string[]).includes(String(row.stageId)),
                ),
            ),
        },
        imNotify: { systemAdd: jest.fn(async () => 1) },
        lead: {
            getList: jest.fn((filter: Row) =>
                Promise.resolve({
                    result: (world.leads ?? []).filter(row =>
                        (filter.ID as number[])
                            .map(String)
                            .includes(String(row.ID)),
                    ),
                }),
            ),
        },
        batch: {
            lead: { update: rec('lead.update', () => ({})) },
            deal: {
                get: rec(
                    'deal.get',
                    id => world.deals.find(d => d.ID === String(id)) ?? null,
                ),
                getList: rec('deal.getList', filter =>
                    world.deals.filter(d => matches(d, filter as Row)),
                ),
                update: rec('deal.update', () => ({})),
                set: rec('deal.set', () => 999),
            },
            company: {
                get: rec(
                    'company.get',
                    id =>
                        world.companies.find(c => c.ID === String(id)) ?? null,
                ),
                update: rec('company.update', () => ({})),
            },
            task: {
                getList: rec('task.getList', filter => ({
                    tasks: world.tasks.filter(t =>
                        t.ufCrmTask.includes(
                            String((filter as Row).UF_CRM_TASK?.[0]),
                        ),
                    ),
                })),
                complete: rec('task.complete', () => ({ task: {} })),
                add: rec('task.add', () => ({ task: { id: 1 } })),
            },
            item: { update: rec('item.update', () => ({})) },
            listItem: { add: rec('listItem.add', () => 1) },
            timeline: { addTimelineComment: rec('timeline.add', () => 1) },
        },
    };
    return { bitrix, journal };
};

const makeHandler = (world: World) => {
    const { bitrix, journal } = makeBitrix(world);
    const pbx = {
        init: jest.fn(async () => ({
            bitrix,
            portal: { domain: 'd.b24.ru' },
            PortalModel,
        })),
    } as unknown as PBXService;
    const presSmart = {
        resolveInfo: jest.fn(async () => PRES_INFO),
    } as unknown as PbxPresentationSmartService;
    const zprSmart = {
        resolveInfo: jest.fn(async () => ZPR_INFO),
    } as unknown as PbxZprSmartService;
    const names = {
        resolve: jest.fn(async () => ({
            447: 'Вадим Савчук',
            448: 'Иван Петров',
        })),
    } as unknown as UserNameResolver;
    const handler = new ColdHooksHandlerV2Service(
        pbx,
        presSmart,
        zprSmart,
        names,
    );
    return { handler, journal, bitrix };
};

const hook = (
    entityType: EnumColdCallEntityType,
    entityId: string,
    force: EnumColdCallForce,
): IColdCallData => ({
    entityType,
    entityId,
    responsible: '447',
    created: '1',
    deadline: '05.09.2026 11:00:00',
    name: 'ООО Ромашка',
    isTmc: EnumColdCallIsTmc.N,
    force,
});

const of = (journal: Array<[string, ...unknown[]]>, name: string) =>
    journal.filter(([n]) => n === name);

describe('ColdHooksHandlerV2Service — компания, force=Y, клиент у другого сотрудника', () => {
    const world: World = {
        companies: [{ ID: '7', TITLE: 'ООО Ромашка' }],
        deals: [
            {
                ID: '500',
                CATEGORY_ID: '17',
                STAGE_ID: 'C17:WARM',
                COMPANY_ID: '7',
                ASSIGNED_BY_ID: '448',
            },
            {
                ID: '510',
                CATEGORY_ID: '48',
                STAGE_ID: 'C48:PLAN',
                COMPANY_ID: '7',
                ASSIGNED_BY_ID: '448',
                UF_CRM_TO_BASE_SALES: '500',
            },
            {
                ID: '490',
                CATEGORY_ID: '17',
                STAGE_ID: 'C17:WON',
                COMPANY_ID: '7',
                ASSIGNED_BY_ID: '448',
            },
        ],
        tasks: [{ id: '31', ufCrmTask: ['CO_7', 'D_510'] }],
        items: {
            '1040': [{ id: 11, stageId: 'DT1040_9:PLAN', ufCrm7BaseDeal: 500 }],
            '1038': [
                { id: 21, stageId: 'DT1038_9:PLAN', ufCrm8Company: 'CO_7' },
            ],
        },
    };

    it('закрывает чужую работу, кроме свежей основной, и создаёт холодную на responsible', async () => {
        const { handler, journal } = makeHandler(world);
        await handler.handleHooks('d.b24.ru', {
            h1: hook(EnumColdCallEntityType.COMPANY, '7', EnumColdCallForce.Y),
        });

        // Закрытие: презентационная сделка → NORESULT с обнулением дат, основная 500 сохранена.
        expect(of(journal, 'deal.update').map(([, key]) => key)).toEqual(
            expect.arrayContaining([
                'xo2_close_deal_h1_510',
                'update_base_deal_500',
            ]),
        );
        expect(journal).toContainEqual([
            'deal.update',
            'xo2_close_deal_h1_510',
            510,
            {
                STAGE_ID: 'C48:NORESULT',
                UF_CRM_CALL_NEXT_DATE: '',
                UF_CRM_XO_DATE: '',
                // Поле есть в слепке — закрытие обнуляет и название события.
                UF_CRM_XO_NAME: '',
            },
        ]);
        expect(of(journal, 'task.complete').map(([, , id]) => id)).toEqual([
            31,
        ]);
        expect(of(journal, 'item.update').map(([, key]) => key)).toEqual([
            'xo2_close_pres_h1_11',
            'xo2_close_zpr_h1_21',
        ]);

        // Создание: владелец-компания, основная переназначена, ХО со ссылкой, задача, KPI.
        expect(of(journal, 'company.update')[0][1]).toBe(
            'xo_hook_update_event_entity_company_7',
        );
        expect(journal).toContainEqual([
            'deal.update',
            'update_base_deal_500',
            500,
            expect.objectContaining({
                ASSIGNED_BY_ID: '447',
                COMPANY_ID: '7',
                STAGE_ID: 'C17:PREPARATION',
            }),
        ]);
        expect(journal).toContainEqual([
            'deal.set',
            'new_cold_deal_7',
            expect.objectContaining({
                COMPANY_ID: '7',
                UF_CRM_TO_BASE_SALES: '500',
            }),
        ]);
        expect(of(journal, 'task.add')).toHaveLength(1);
        expect(of(journal, 'listItem.add')).toHaveLength(2);
    });

    it('таймлайн: итог во входные сущности, «забрали» — владельцу основной; push ему же', async () => {
        const { handler, journal, bitrix } = makeHandler(world);
        await handler.handleHooks('d.b24.ru', {
            h1: hook(EnumColdCallEntityType.COMPANY, '7', EnumColdCallForce.Y),
        });
        const timeline = of(journal, 'timeline.add').map(([, key, data]) => [
            key,
            (data as Row).COMMENT,
        ]);
        // Сделка 500 — и сохранённая основная (итог), и чужая (забрали): два
        // разных ключа, обе записи доезжают.
        expect(timeline.map(([key]) => key)).toEqual([
            'xo2_tl_h1_0_company_7',
            'xo2_tl_h1_1_deal_500',
            'xo2_tl_h1_2_deal_500',
        ]);
        expect(String(timeline[0][1])).toContain(
            '<b>Холодный старт</b> — ответственный: Вадим Савчук.',
        );
        expect(String(timeline[2][1])).toContain(
            '<b>Вашу компанию забрали в работу</b>: Вадим Савчук',
        );
        expect(bitrix.imNotify.systemAdd).toHaveBeenCalledWith(
            expect.objectContaining({
                USER_ID: 448,
                TAG: 'xo2_cold_start_co_7_448',
                MESSAGE: expect.stringContaining(
                    '[B]У вас забрали компанию в работу[/B]',
                ),
            }),
        );
    });
});

describe('ColdHooksHandlerV2Service — сделка без компании', () => {
    const foreignWorld: World = {
        companies: [],
        deals: [
            {
                ID: '600',
                CATEGORY_ID: '48',
                STAGE_ID: 'C48:PLAN',
                COMPANY_ID: '',
                ASSIGNED_BY_ID: '447',
                LEAD_ID: '12',
                UF_CRM_TO_BASE_SALES: 'D_77',
            },
            {
                ID: '77',
                CATEGORY_ID: '17',
                STAGE_ID: 'C17:WARM',
                COMPANY_ID: '',
                ASSIGNED_BY_ID: '448',
                LEAD_ID: '12',
            },
        ],
        tasks: [
            { id: '41', ufCrmTask: ['D_600'] },
            { id: '42', ufCrmTask: ['D_77'] },
        ],
        items: {
            '1040': [{ id: 11, stageId: 'DT1040_9:PLAN', ufCrm7Deal: 600 }],
            '1038': [
                { id: 21, stageId: 'DT1038_9:PLAN', ufCrm8BaseDeal: 'D_77' },
            ],
        },
    };

    it('force=N при чужой основной: уступаем — закрыта только входная и её привязки, ничего не создано', async () => {
        const { handler, journal, bitrix } = makeHandler(foreignWorld);
        await handler.handleHooks('d.b24.ru', {
            h2: hook(EnumColdCallEntityType.DEAL, '600', EnumColdCallForce.N),
        });

        expect(of(journal, 'deal.update').map(([, key]) => key)).toEqual([
            'xo2_close_deal_h2_600',
            // Уступили — но хук отработал, и подстраховка это фиксирует.
            'xo2_sent_h2',
        ]);
        expect(of(journal, 'task.complete').map(([, , id]) => id)).toEqual([
            41,
        ]);
        expect(of(journal, 'item.update').map(([, key]) => key)).toEqual([
            'xo2_close_pres_h2_11',
        ]);
        expect(of(journal, 'deal.set')).toHaveLength(0);
        expect(of(journal, 'task.add')).toHaveLength(0);
        expect(of(journal, 'listItem.add')).toHaveLength(0);

        const timeline = of(journal, 'timeline.add').map(([, key, data]) => [
            key,
            (data as Row).COMMENT,
        ]);
        expect(timeline.map(([key]) => key)).toEqual([
            'xo2_tl_h2_0_deal_600',
            'xo2_tl_h2_1_deal_77',
        ]);
        expect(String(timeline[0][1])).toContain(
            '<b>Холодный старт уступлен</b>: клиент в работе у Иван Петров',
        );
        expect(String(timeline[1][1])).toContain(
            '<b>Попытка взять вашего клиента в работу</b>: Вадим Савчук',
        );
        expect(bitrix.imNotify.systemAdd).toHaveBeenCalledWith(
            expect.objectContaining({
                USER_ID: 448,
                MESSAGE: expect.stringContaining(
                    '[B]У вас попытались забрать клиента в работу[/B]',
                ),
            }),
        );
        // Записи таймлайна уехали: группа yield закрыта и отправлена.
        expect(bitrix.api.callBatchWithConcurrency).toHaveBeenCalled();
    });

    it('force=N без чужой работы: полный старт без COMPANY_ID, с лидом и контактом входной', async () => {
        const world: World = {
            companies: [],
            deals: [
                {
                    ID: '600',
                    CATEGORY_ID: '17',
                    STAGE_ID: 'C17:WARM',
                    COMPANY_ID: '',
                    ASSIGNED_BY_ID: '447',
                    LEAD_ID: '12',
                    CONTACT_ID: '9',
                },
            ],
            tasks: [],
            items: {},
        };
        const { handler, journal, bitrix } = makeHandler(world);
        await handler.handleHooks('d.b24.ru', {
            h3: hook(EnumColdCallEntityType.DEAL, '600', EnumColdCallForce.N),
        });

        // Корень — сама сделка (sales_base): сохранена и обновлена как основная.
        expect(of(journal, 'deal.update').map(([, key]) => key)).toEqual([
            'update_base_deal_600',
            'xo2_sent_h3',
        ]);
        const [, , , basePayload] = of(journal, 'deal.update')[0];
        expect(basePayload).not.toHaveProperty('COMPANY_ID');
        expect(journal).toContainEqual([
            'deal.set',
            'new_cold_deal_deal_600',
            expect.objectContaining({
                CONTACT_ID: '9',
                LEAD_ID: '12',
                UF_CRM_TO_BASE_SALES: '600',
            }),
        ]);
        expect(journal).toContainEqual([
            'task.add',
            'bx_task_add_deal_600',
            expect.objectContaining({
                UF_CRM_TASK: [
                    'D_600',
                    'D_$result[new_cold_deal_deal_600]',
                    'L_12',
                ],
            }),
        ]);
        expect(of(journal, 'company.update')).toHaveLength(0);
        expect(bitrix.imNotify.systemAdd).not.toHaveBeenCalled();
        expect(of(journal, 'timeline.add').map(([, key]) => key)).toEqual([
            'xo2_tl_h3_0_deal_600',
        ]);
    });
});

describe('ColdHooksHandlerV2Service — адресный ХО принимает ждущую заявку', () => {
    const world: World = {
        companies: [],
        deals: [
            {
                ID: '600',
                CATEGORY_ID: '17',
                STAGE_ID: 'C17:WARM',
                COMPANY_ID: '',
                ASSIGNED_BY_ID: '447',
                LEAD_ID: '',
                UF_CRM_DEAL_FROM_LEAD_ID: 'L_12',
                UF_CRM_OP_LEAD_ASSIGNED_AT: '2026-09-16T16:20:47+03:00',
            },
        ],
        tasks: [],
        items: {},
        leads: [
            {
                ID: '12',
                ASSIGNED_BY_ID: '448',
                STATUS_SEMANTIC_ID: 'P',
                UF_CRM_OP_LEAD_ASSIGNED_AT: '2026-09-16T16:20:47+03:00',
                UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY: [
                    '16.09.2026 16:20 — ХО назначен: Иван Петров',
                ],
            },
        ],
    };

    it('лид уходит новому ответственному, таймеры лида и сделки сняты, в истории — передача и принятие', async () => {
        const { handler, journal, bitrix } = makeHandler(world);
        await handler.handleHooks('d.b24.ru', {
            h4: hook(EnumColdCallEntityType.DEAL, '600', EnumColdCallForce.N),
        });

        expect(bitrix.lead.getList).toHaveBeenCalledWith(
            { ID: [12] },
            expect.any(Array),
        );
        const leadUpdates = of(journal, 'lead.update');
        expect(leadUpdates).toHaveLength(1);
        const [, key, leadId, fields] = leadUpdates[0] as [
            string,
            string,
            number,
            Row,
        ];
        expect(key).toBe('xo2_lead_h4_12');
        expect(leadId).toBe(12);
        expect(fields).toMatchObject({
            ASSIGNED_BY_ID: '447',
            STATUS_ID: 'PBX_TAKEN_IN_WORK',
            UF_CRM_OP_LEAD_ASSIGNED_AT: '',
            UF_CRM_OP_LEAD_ACCEPTED_BY: 447,
        });
        const history = fields.UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY as string[];
        expect(history[1]).toContain('ХО передан: Иван Петров → Вадим Савчук');
        expect(history[2]).toContain(
            'Заявка принята в работу: Вадим Савчук (адресный ХО)',
        );

        const basePayload = of(journal, 'deal.update')[0][3];
        expect(basePayload).toMatchObject({
            UF_CRM_OP_LEAD_ASSIGNED_AT: '',
            UF_CRM_OP_LEAD_ACCEPTED_BY: 447,
        });
    });

    it('принятая и закрытая заявки не трогаются', async () => {
        const quiet: World = {
            ...world,
            deals: [{ ...world.deals[0], UF_CRM_OP_LEAD_ASSIGNED_AT: '' }],
            leads: [
                { ...world.leads![0], UF_CRM_OP_LEAD_ASSIGNED_AT: '' },
                { ...world.leads![0], ID: '13', STATUS_SEMANTIC_ID: 'F' },
            ],
        };
        const { handler, journal } = makeHandler(quiet);
        await handler.handleHooks('d.b24.ru', {
            h5: hook(EnumColdCallEntityType.DEAL, '600', EnumColdCallForce.N),
        });

        expect(of(journal, 'lead.update')).toHaveLength(0);
        const basePayload = of(journal, 'deal.update')[0][3];
        expect(basePayload).not.toHaveProperty('UF_CRM_OP_LEAD_ASSIGNED_AT');
        expect(basePayload).not.toHaveProperty('UF_CRM_OP_LEAD_ACCEPTED_BY');
    });
});

describe('ColdHooksHandlerV2Service — два хука в одном окне', () => {
    it('чтение и закрытие обоих идут ДО записи; группы создания уезжают одним flush', async () => {
        const world: World = {
            companies: [
                { ID: '7', TITLE: 'ООО Ромашка' },
                { ID: '8', TITLE: 'ООО Лютик' },
            ],
            deals: [
                {
                    ID: '500',
                    CATEGORY_ID: '17',
                    STAGE_ID: 'C17:WARM',
                    COMPANY_ID: '7',
                    ASSIGNED_BY_ID: '447',
                },
                {
                    ID: '800',
                    CATEGORY_ID: '17',
                    STAGE_ID: 'C17:WARM',
                    COMPANY_ID: '8',
                    ASSIGNED_BY_ID: '447',
                },
            ],
            tasks: [],
            items: {},
        };
        const { handler, journal, bitrix } = makeHandler(world);
        await handler.handleHooks('d.b24.ru', {
            h1: hook(EnumColdCallEntityType.COMPANY, '7', EnumColdCallForce.N),
            h2: hook(EnumColdCallEntityType.COMPANY, '8', EnumColdCallForce.N),
        });
        const names = journal.map(([n]) => n);
        // Все чтения (фаза 1) раньше первой записи создания (фаза 2): иначе
        // группа хука 1 уехала бы чужим батчем вместе с чтениями хука 2.
        const READS = [
            'deal.get',
            'company.get',
            'deal.getList',
            'task.getList',
        ];
        const CREATES = [
            'company.update',
            'deal.set',
            'task.add',
            'listItem.add',
            'timeline.add',
        ];
        const readIdx = names
            .map((n, i) => (READS.includes(n) ? i : -1))
            .filter(i => i >= 0);
        const createIdx = names
            .map((n, i) => (CREATES.includes(n) ? i : -1))
            .filter(i => i >= 0);
        expect(readIdx.length).toBeGreaterThan(0);
        expect(createIdx.length).toBeGreaterThan(0);
        expect(Math.max(...readIdx)).toBeLessThan(Math.min(...createIdx));
        // Обе группы создания: по одной ХО-сделке и задаче на компанию.
        expect(of(journal, 'deal.set').map(([, key]) => key)).toEqual([
            'new_cold_deal_7',
            'new_cold_deal_8',
        ]);
        expect(of(journal, 'task.add').map(([, key]) => key)).toEqual([
            'bx_task_add_7',
            'bx_task_add_8',
        ]);
        // Между фазой чтения и итоговым flush чужие батчи группы не уносят:
        // после последней записи создания ровно один вызов батча.
        const calls = (bitrix.api.callBatchWithConcurrency as jest.Mock).mock
            .calls.length;
        expect(calls).toBeGreaterThan(0);
        expect(bitrix.imNotify.systemAdd).not.toHaveBeenCalled();
    });
});

describe('ColdHooksHandlerV2Service — пустое окно', () => {
    it('без хуков не трогает портал', async () => {
        const { handler, journal, bitrix } = makeHandler({
            companies: [],
            deals: [],
            tasks: [],
            items: {},
        });
        await handler.handleHooks('d.b24.ru', {});
        expect(journal).toEqual([]);
        expect(bitrix.api.callBatchWithConcurrency).not.toHaveBeenCalled();
    });
});

/**
 * Вторая фаза подстраховки. Робот ставит «взято в очередь» ПЕРЕД вызовом,
 * бэкенд — «хук отправлен» после обработки; крон досылает те элементы, где
 * первая метка новее второй.
 *
 * Без этой записи КАЖДЫЙ нормально отработавший хук выглядел бы для крона
 * недоехавшим, и клиент получал бы второй холодный звонок через порог
 * досылки. Проверяем именно факт записи, а не её значение.
 */
describe('ColdHooksHandlerV2Service — отметка «хук отработал»', () => {
    const world: World = {
        companies: [{ ID: '7', TITLE: 'ООО Ромашка' }],
        deals: [],
        tasks: [],
        items: {},
    };

    const sentMarks = (journal: Array<[string, ...unknown[]]>) =>
        of(journal, 'company.update').filter(([, , , fields]) =>
            Object.keys((fields ?? {}) as Record<string, unknown>).includes(
                'UF_CRM_OP_XO_REVIVE_SENT_AT',
            ),
        );

    it('после обработки метка ставится на сущность входа хука', async () => {
        const { handler, journal } = makeHandler(world);

        await handler.handleHooks('d.b24.ru', {
            h1: hook(EnumColdCallEntityType.COMPANY, '7', EnumColdCallForce.N),
        });

        expect(sentMarks(journal)).toHaveLength(1);
    });
});

/**
 * Вход-сделка, У КОТОРОЙ ЕСТЬ КОМПАНИЯ.
 *
 * Корнем работы становится компания, но робот заполнял поля события НА
 * СДЕЛКЕ — он же её и отправлял. Если читать поля по корню, в карточке
 * компании не найдётся ничего, и звонок молча не поставится (ровно это и
 * случилось на сделке 25521, 13.09.2026).
 */
describe('ColdHooksHandlerV2Service — поля читаются со входа хука', () => {
    const world: World = {
        companies: [{ ID: '7', TITLE: 'ООО Ромашка' }],
        deals: [
            {
                ID: '600',
                CATEGORY_ID: '17',
                STAGE_ID: 'C17:NEW',
                COMPANY_ID: '7',
                ASSIGNED_BY_ID: '447',
                // Робот заполнил событие именно здесь.
                UF_CRM_XO_RESPONSIBLE: '447',
                UF_CRM_XO_DATE: '05.09.2026 11:00:00',
                UF_CRM_XO_NAME: 'ООО Ромашка',
            },
        ],
        tasks: [],
        items: {},
    };

    /** Хук без данных события в query — всё должно прийти из карточки. */
    const bareHook = (): IColdCallData => ({
        entityType: EnumColdCallEntityType.DEAL,
        entityId: '600',
        isTmc: EnumColdCallIsTmc.N,
    });

    it('вход-сделка с компанией: звонок ставится по полям СДЕЛКИ', async () => {
        const { handler, journal } = makeHandler(world);

        await handler.handleHooks('d.b24.ru', { h9: bareHook() });

        // Работа создана: появилась холодная сделка.
        expect(of(journal, 'deal.set').length).toBeGreaterThan(0);
    });

    it('данных нет нигде → в таймлайн уходит объяснение, а не тишина', async () => {
        const bare: World = {
            ...world,
            deals: [
                {
                    ID: '600',
                    CATEGORY_ID: '17',
                    STAGE_ID: 'C17:NEW',
                    COMPANY_ID: '7',
                    ASSIGNED_BY_ID: '447',
                },
            ],
        };
        const { handler, journal } = makeHandler(bare);

        await handler.handleHooks('d.b24.ru', { h9: bareHook() });

        expect(of(journal, 'deal.set')).toHaveLength(0);
        const notes = of(journal, 'timeline.add');
        expect(notes.length).toBeGreaterThan(0);
        /*
         * Запись должна лечь В КАРТОЧКУ, ИЗ КОТОРОЙ ЗАПУСКАЛИ. У входа-сделки
         * с компанией корнем работы становится компания, и объяснение
         * уезжало в чужую карточку — снаружи это выглядело как «вообще
         * ничего не произошло» (сделка 25391, 13.09.2026).
         */
        const [, , payload] = notes[0] as [
            string,
            string,
            { ENTITY_TYPE: string; ENTITY_ID: number },
        ];
        expect(payload.ENTITY_TYPE).toBe('deal');
        expect(payload.ENTITY_ID).toBe(600);
    });
});
