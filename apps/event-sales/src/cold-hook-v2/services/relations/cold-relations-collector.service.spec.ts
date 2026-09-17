import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PresentationSmartInfo } from '@lib/portal-lib/pbx/pbx-presentation-smart';
import { ZprSmartInfo } from '@lib/portal-lib/pbx/pbx-zpr-smart';
import {
    EnumColdCallEntityType,
    EnumColdCallForce,
    EnumColdCallIsTmc,
} from '../../dto/cold.dto';
import { ColdTarget } from '../target/cold-target.types';
import { ColdRelationsCollectorV2Service } from './cold-relations-collector.service';
import { ColdSmartInfos } from './cold-relations.types';

/**
 * Сборщик связей (шаг 3 плана v2) — только чтение. Проверяем, ЧТО и КАК
 * читается: фильтры по открытым стадиям, привязки задач, матч элементов
 * смартов по связи в JS, самогейт по неустановленному смарту.
 */
type Row = Record<string, unknown>;

const BASE = { bitrixId: '17', code: 'sales_base' };
const XO = { bitrixId: '32', code: 'sales_xo' };
const stage = (code: string, bitrixId: string) => ({ code, bitrixId });
const CATEGORIES = [
    {
        ...BASE,
        stages: [
            stage('sales_cold', 'PREPARATION'),
            stage('sales_warm', 'WARM'),
            stage('sales_success', 'WON'),
            stage('sales_fail', 'LOSE'),
            stage('sales_double', 'APOLOGY'),
        ],
    },
    {
        ...XO,
        stages: [
            stage('cold_plan', 'PLAN'),
            stage('cold_noresult', 'NORESULT'),
        ],
    },
];

const makePortal = () =>
    ({
        getDealCategoryByCode: (code: string) =>
            CATEGORIES.find(c => c.code === code),
        getDealCategories: () => CATEGORIES,
        getEntityFieldByCode: (_entity: string, code: string) =>
            code === 'deal_from_lead_id'
                ? { bitrixId: 'DEAL_FROM_LEAD_ID' }
                : code === 'deal_joined_leads'
                  ? { bitrixId: 'DEAL_JOINED_LEADS' }
                  : undefined,
        getSalesTaskGroupId: () => 41,
        getDealFieldByCode: () => undefined,
        getDealFields: () => [],
    }) as unknown as PortalModel;

const hook = (entityType: EnumColdCallEntityType, entityId: string) => ({
    entityType,
    entityId,
    responsible: 'user_447',
    created: 'user_1',
    deadline: '05.09.2026 11:00:00',
    name: 'ХО',
    isTmc: EnumColdCallIsTmc.N,
    force: EnumColdCallForce.N,
});

const companyTarget = (): ColdTarget => ({
    hookKey: 'h1',
    hook: hook(EnumColdCallEntityType.COMPANY, '7'),
    kind: 'company',
    company: { ID: '7' } as never,
    companyId: 7,
    entryDeal: null,
    rootDealId: null,
});

const dealTarget = (entry: Row, rootDealId: number | null): ColdTarget => ({
    hookKey: 'h2',
    hook: hook(EnumColdCallEntityType.DEAL, String(entry.ID)),
    kind: 'deal',
    company: null,
    companyId: null,
    entryDeal: entry as never,
    rootDealId,
});

const PRES_INFO = {
    entityTypeId: 1040,
    typeId: 7,
    ufKeyByCode: {
        PRES_BASE_DEAL: 'ufCrm7BaseDeal',
        PRES_DEAL: 'ufCrm7Deal',
        PRES_COMPANY: 'ufCrm7Company',
        PRES_LEAD: 'ufCrm7Lead',
    },
    enumItems: {},
    stageIdByCode: {
        pres_new: 'DT1040_9:NEW',
        pres_plan: 'DT1040_9:PLAN',
        pres_success: 'DT1040_9:SUCCESS',
    },
} as unknown as PresentationSmartInfo;

const ZPR_INFO = {
    entityTypeId: 1038,
    typeId: 8,
    ufKeyByCode: {
        ZPR_BASE_DEAL: 'ufCrm8BaseDeal',
        ZPR_COMPANY: 'ufCrm8Company',
        ZPR_LEAD: 'ufCrm8Lead',
    },
    enumItems: {},
    stageIdByCode: {
        zpr_plan: 'DT1038_9:PLAN',
        zpr_pending: 'DT1038_9:PENDING',
        zpr_fail: 'DT1038_9:FAIL',
    },
} as unknown as ZprSmartInfo;

interface Fake {
    dealAll: jest.Mock<Promise<Row[]>, [Row, string[]]>;
    dealGetList: jest.Mock<void, [string, Row]>;
    taskGetList: jest.Mock<void, [string, Row]>;
    itemListAll: jest.Mock<Promise<Row[]>, [string]>;
    callBatch: jest.Mock<Promise<Array<{ result: Row }>>, []>;
}

/**
 * Фейк bitrix: батч-команды копятся, callBatch отдаёт по ключу то, что
 * задал тест (`answers` — функция от ключа и фильтра).
 */
const makeBitrix = (
    answers: (key: string, filter: Row) => unknown,
    itemRows: Record<string, Row[]> = {},
    companyDeals: Row[] = [],
): Fake & { bitrix: BitrixService } => {
    const pending: Array<[string, Row]> = [];
    const dealAll = jest.fn<Promise<Row[]>, [Row, string[]]>(() =>
        Promise.resolve(companyDeals),
    );
    const dealGetList = jest.fn<void, [string, Row]>((key, filter) => {
        pending.push([key, filter]);
    });
    const taskGetList = jest.fn<void, [string, Row]>((key, filter) => {
        pending.push([key, filter]);
    });
    const itemListAll = jest.fn<Promise<Row[]>, [string]>(entityTypeId =>
        Promise.resolve(itemRows[entityTypeId] ?? []),
    );
    const callBatch = jest.fn<Promise<Array<{ result: Row }>>, []>(() => {
        const result: Row = {};
        for (const [key, filter] of pending) {
            result[key] = answers(key, filter);
        }
        pending.length = 0;
        return Promise.resolve([{ result }]);
    });
    const bitrix = {
        api: { domain: 'd.b24.ru', callBatchWithConcurrency: callBatch },
        deal: { all: dealAll },
        item: { listAll: itemListAll },
        batch: {
            deal: { getList: dealGetList },
            task: { getList: taskGetList },
        },
    } as unknown as BitrixService;
    return {
        bitrix,
        dealAll,
        dealGetList,
        taskGetList,
        itemListAll,
        callBatch,
    };
};

const collect = (
    target: ColdTarget,
    fake: ReturnType<typeof makeBitrix>,
    smarts: ColdSmartInfos = { pres: PRES_INFO, zpr: ZPR_INFO },
) =>
    new ColdRelationsCollectorV2Service(makePortal(), fake.bitrix).collect(
        target,
        smarts,
    );

const OPEN_STAGES = ['C17:PREPARATION', 'C17:WARM', 'C32:PLAN'];

describe('ColdRelationsCollectorV2Service — корень компания', () => {
    const deals = [
        {
            ID: '500',
            CATEGORY_ID: '17',
            COMPANY_ID: '7',
            ASSIGNED_BY_ID: '447',
        },
        {
            ID: '510',
            CATEGORY_ID: '32',
            COMPANY_ID: '7',
            ASSIGNED_BY_ID: '447',
        },
    ];
    const tasksByKey = (key: string) =>
        key.endsWith('CO_7')
            ? { tasks: [{ id: '1', title: 'ХО', ufCrmTask: ['CO_7'] }] }
            : key.endsWith('D_500')
              ? {
                    tasks: [
                        { id: '2', title: 'Звонок', ufCrmTask: ['D_500'] },
                        { id: '1', title: 'ХО' },
                    ],
                }
              : { tasks: [] };

    it('сделки — открытые стадии четырёх воронок по COMPANY_ID (как v1)', async () => {
        const fake = makeBitrix(tasksByKey, {}, deals);
        const relations = await collect(companyTarget(), fake);
        expect(fake.dealAll).toHaveBeenCalledWith(
            { '=STAGE_ID': OPEN_STAGES, '=COMPANY_ID': [7] },
            expect.arrayContaining([
                'ID',
                'CATEGORY_ID',
                'UF_CRM_TO_BASE_SALES',
            ]),
        );
        expect(relations.deals.map(d => d.ID)).toEqual(['500', '510']);
        expect(relations.openBaseDeals.map(d => d.ID)).toEqual(['500']);
        expect(relations.dealIds).toEqual([500, 510]);
    });

    it('задачи — по CO_ и по D_ каждой сделки, группа обзвона, без дублей', async () => {
        const fake = makeBitrix(tasksByKey, {}, deals);
        const relations = await collect(companyTarget(), fake);
        const bindings = fake.taskGetList.mock.calls.map(
            ([, filter]) => filter.UF_CRM_TASK,
        );
        expect(bindings).toEqual([['CO_7'], ['D_500'], ['D_510']]);
        expect(fake.taskGetList.mock.calls[0][1]).toMatchObject({
            '!STATUS': '5',
            GROUP_ID: 41,
        });
        expect(relations.tasks.map(t => (t as unknown as Row).id)).toEqual([
            '1',
            '2',
        ]);
    });

    it('элементы — открытые стадии через listAll, матч по компании или сделке', async () => {
        const fake = makeBitrix(
            tasksByKey,
            {
                '1040': [
                    { id: 1, ufCrm7Company: 'CO_7' },
                    { id: 2, ufCrm7BaseDeal: 500 },
                    { id: 3, ufCrm7Company: 'CO_8', ufCrm7BaseDeal: 'D_999' },
                ],
                '1038': [{ id: 9, ufCrm8BaseDeal: 'D_510' }, { id: 10 }],
            },
            deals,
        );
        const relations = await collect(companyTarget(), fake);
        expect(fake.itemListAll).toHaveBeenCalledWith(
            '1040',
            { stageId: ['DT1040_9:NEW', 'DT1040_9:PLAN'] },
            expect.arrayContaining([
                'id',
                'stageId',
                'assignedById',
                'ufCrm7Company',
            ]),
        );
        expect(fake.itemListAll).toHaveBeenCalledWith(
            '1038',
            { stageId: ['DT1038_9:PLAN', 'DT1038_9:PENDING'] },
            expect.any(Array),
        );
        expect(relations.pres.rows.map(r => r.id)).toEqual([1, 2]);
        expect(relations.zpr.rows.map(r => r.id)).toEqual([9]);
        expect(relations.pres.info).toBe(PRES_INFO);
    });

    it('смарт не установлен — список пуст, listAll не зовётся', async () => {
        const fake = makeBitrix(tasksByKey, {}, deals);
        const relations = await collect(companyTarget(), fake, {
            pres: null,
            zpr: null,
        });
        expect(relations.pres).toEqual({ info: null, rows: [] });
        expect(relations.zpr).toEqual({ info: null, rows: [] });
        expect(fake.itemListAll).not.toHaveBeenCalled();
    });
});

describe('ColdRelationsCollectorV2Service — корень сделка без компании', () => {
    const entry: Row = {
        ID: '600',
        CATEGORY_ID: '32',
        COMPANY_ID: '',
        LEAD_ID: '12',
        UF_CRM_TO_BASE_SALES: 'D_77',
        UF_CRM_TO_PRESENTATION_SALES: '78',
        UF_CRM_DEAL_FROM_LEAD_ID: 'L_5',
        UF_CRM_DEAL_JOINED_LEADS: ['L_5', '13'],
    };
    const answers = (key: string, filter: Row): unknown => {
        if (key.endsWith('_by_id')) {
            return [
                { ID: '600', CATEGORY_ID: '32' },
                { ID: '77', CATEGORY_ID: '17', ASSIGNED_BY_ID: '448' },
            ];
        }
        if (key.endsWith('_by_lead')) {
            return [
                { ID: '77', CATEGORY_ID: '17' },
                { ID: '80', CATEGORY_ID: '17' },
            ];
        }
        if (key.endsWith('_by_root')) {
            return [{ ID: '78', CATEGORY_ID: '48' }];
        }
        if (String(filter.UF_CRM_TASK?.[0]).startsWith('D_77')) {
            return { tasks: [{ id: '21' }] };
        }
        if (String(filter.UF_CRM_TASK?.[0]).startsWith('L_12')) {
            return { tasks: [{ id: '22' }] };
        }
        return { tasks: [] };
    };

    it('сделки — по ссылкам входной, по лидам и по ссылке на корень, без дублей', async () => {
        const fake = makeBitrix(answers);
        const relations = await collect(dealTarget(entry, 77), fake);
        const filters = fake.dealGetList.mock.calls.map(([key, filter]) => [
            String(key).replace(/^xo2_rel_h2_/, ''),
            filter,
        ]);
        expect(filters).toEqual([
            ['by_id', { ID: [600, 77, 78], '=STAGE_ID': OPEN_STAGES }],
            ['by_lead', { LEAD_ID: [12, 5, 13], '=STAGE_ID': OPEN_STAGES }],
            ['by_root', { UF_CRM_TO_BASE_SALES: 77, '=STAGE_ID': OPEN_STAGES }],
        ]);
        expect(relations.deals.map(d => d.ID)).toEqual([
            '600',
            '77',
            '80',
            '78',
        ]);
        expect(relations.openBaseDeals.map(d => d.ID)).toEqual(['77', '80']);
        expect(relations.leadIds).toEqual([12, 5, 13]);
        expect(relations.dealIds).toEqual([600, 77, 80, 78]);
        expect(fake.dealAll).not.toHaveBeenCalled();
    });

    it('задачи — D_ по каждой сделке графа и L_ по лидам, компании нет', async () => {
        const fake = makeBitrix(answers);
        const relations = await collect(dealTarget(entry, 77), fake);
        const bindings = fake.taskGetList.mock.calls.map(
            ([, filter]) => filter.UF_CRM_TASK,
        );
        expect(bindings).toEqual([
            ['D_600'],
            ['D_77'],
            ['D_80'],
            ['D_78'],
            ['L_12'],
            ['L_5'],
            ['L_13'],
        ]);
        expect(relations.tasks.map(t => (t as unknown as Row).id)).toEqual([
            '21',
            '22',
        ]);
    });

    it('элементы — по сделкам графа и по лидам, чужие не попадают', async () => {
        const fake = makeBitrix(answers, {
            '1040': [
                { id: 1, ufCrm7BaseDeal: 'D_77' },
                { id: 2, ufCrm7Lead: 13 },
                { id: 3, ufCrm7Company: 'CO_7' },
            ],
            '1038': [
                { id: 9, ufCrm8BaseDeal: 999 },
                { id: 10, ufCrm8Lead: 'L_12' },
            ],
        });
        const relations = await collect(dealTarget(entry, 77), fake);
        expect(relations.pres.rows.map(r => r.id)).toEqual([1, 2]);
        expect(relations.zpr.rows.map(r => r.id)).toEqual([10]);
    });

    it('без корня и лидов — один запрос по id, задачи только D_ входной', async () => {
        const bare: Row = { ID: '800', CATEGORY_ID: '48', COMPANY_ID: '' };
        const fake = makeBitrix(key =>
            key.endsWith('_by_id') ? [] : { tasks: [] },
        );
        const relations = await collect(dealTarget(bare, null), fake);
        expect(fake.dealGetList).toHaveBeenCalledTimes(1);
        expect(fake.dealGetList.mock.calls[0][1]).toEqual({
            ID: [800],
            '=STAGE_ID': OPEN_STAGES,
        });
        expect(relations.deals).toEqual([]);
        expect(relations.dealIds).toEqual([800]);
        expect(
            fake.taskGetList.mock.calls.map(([, f]) => f.UF_CRM_TASK),
        ).toEqual([['D_800']]);
    });
});

describe('ColdRelationsCollectorV2Service — ссылки на лиды', () => {
    it('select сделок включает LEAD_ID и поля-ссылки на лиды: адресный ХО берёт лиды основной и при входе-компании', async () => {
        const fake = makeBitrix(() => []);
        await collect(companyTarget(), fake, { pres: null, zpr: null });

        const [, select] = fake.dealAll.mock.calls[0];
        expect(select).toEqual(
            expect.arrayContaining([
                'LEAD_ID',
                'UF_CRM_DEAL_FROM_LEAD_ID',
                'UF_CRM_DEAL_JOINED_LEADS',
            ]),
        );
    });

    it('лиды входной сделки: LEAD_ID и множественная ссылка, без дублей', async () => {
        const fake = makeBitrix(() => []);
        const relations = await collect(
            dealTarget(
                {
                    ID: '600',
                    LEAD_ID: '12',
                    UF_CRM_DEAL_FROM_LEAD_ID: 'L_12',
                    UF_CRM_DEAL_JOINED_LEADS: ['L_13', 'L_14'],
                },
                null,
            ),
            fake,
            { pres: null, zpr: null },
        );

        expect(relations.leadIds).toEqual([12, 13, 14]);
    });
});
