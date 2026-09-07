import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PresentationSmartInfo } from '@lib/portal-lib/pbx/pbx-presentation-smart';
import { ZprSmartInfo } from '@lib/portal-lib/pbx/pbx-zpr-smart';
import {
    EnumColdCallEntityType,
    EnumColdCallForce,
    EnumColdCallIsTmc,
} from '../../dto/cold.dto';
import { ColdStartDecision } from '../../lib/cold-force.decision';
import { ColdTarget } from '../target/cold-target.types';
import { ColdRelationsCloserV2Service } from './cold-relations-closer.service';
import { ColdRelations } from './cold-relations.types';

/**
 * Закрытие (шаг 5 плана v2): состав batch-команд по режимам. `proceed` —
 * всё открытое, кроме сохраняемой основной; `yield` — только граф входной
 * сделки, чужая основная и её привязки не трогаются.
 */
type Row = Record<string, unknown>;

const stage = (code: string, bitrixId: string) => ({ code, bitrixId });
const CATEGORIES = [
    {
        bitrixId: '17',
        code: 'sales_base',
        title: 'ОП',
        stages: [stage('sales_cold', 'PREPARATION'), stage('sales_double', 'APOLOGY')],
    },
    {
        bitrixId: '48',
        code: 'sales_presentation',
        title: 'Презентации',
        stages: [stage('spres_plan', 'PLAN'), stage('spres_noresult', 'NORESULT')],
    },
    {
        bitrixId: '99',
        code: 'custom',
        title: 'Без закрывающей',
        stages: [stage('custom_new', 'NEW')],
    },
];

const DATE_FIELDS: Record<string, string> = {
    call_next_date: 'CALL_NEXT_DATE',
    call_next_name: 'CALL_NEXT_NAME',
    next_pres_plan_date: 'NEXT_PRES_PLAN_DATE',
    xo_date: 'XO_DATE',
};

const portal = {
    getDealCategoryByCode: (code: string) => CATEGORIES.find(c => c.code === code),
    getDealCategories: () => CATEGORIES,
    getEntityFieldByCode: (_entity: string, code: string) =>
        DATE_FIELDS[code] ? { bitrixId: DATE_FIELDS[code] } : undefined,
} as unknown as PortalModel;

const makeBitrix = () => {
    const dealUpdate = jest.fn();
    const taskComplete = jest.fn();
    const itemUpdate = jest.fn();
    const callBatch = jest.fn(async () => []);
    const bitrix = {
        api: { callBatchWithConcurrency: callBatch },
        batch: {
            deal: { update: dealUpdate },
            task: { complete: taskComplete },
            item: { update: itemUpdate },
        },
    } as unknown as BitrixService;
    return { bitrix, dealUpdate, taskComplete, itemUpdate, callBatch };
};

const hook = {
    entityType: EnumColdCallEntityType.DEAL,
    entityId: '600',
    responsible: '447',
    created: '1',
    deadline: '05.09.2026 11:00:00',
    name: 'ХО',
    isTmc: EnumColdCallIsTmc.N,
    force: EnumColdCallForce.N,
};

const PRES_INFO = {
    entityTypeId: 1040,
    ufKeyByCode: { PRES_BASE_DEAL: 'ufCrm7BaseDeal', PRES_DEAL: 'ufCrm7Deal' },
    stageIdByCode: { pres_noresult: 'DT1040_9:NORESULT' },
} as unknown as PresentationSmartInfo;
const ZPR_INFO = {
    entityTypeId: 1038,
    ufKeyByCode: { ZPR_BASE_DEAL: 'ufCrm8BaseDeal' },
    stageIdByCode: { zpr_fail: 'DT1038_9:FAIL' },
} as unknown as ZprSmartInfo;

const deal = (ID: string, CATEGORY_ID: string, extra: Row = {}): IBXDeal =>
    ({ ID, CATEGORY_ID, ...extra }) as unknown as IBXDeal;

/** Клиент: две основные (500 — чужая, 600 — входная), их презентации и ХО. */
const DEALS = [
    deal('500', '17', { ASSIGNED_BY_ID: '448' }),
    deal('600', '17', { ASSIGNED_BY_ID: '447' }),
    deal('510', '48', { UF_CRM_TO_BASE_SALES: 'D_500' }),
    deal('610', '48', { UF_CRM_TO_BASE_SALES: '600' }),
    deal('620', '99', { UF_CRM_TO_BASE_SALES: '600' }),
];
const TASKS = [
    { id: '1', ufCrmTask: ['CO_7', 'D_500'] },
    { id: '2', ufCrmTask: ['D_610'] },
    { id: '3', ufCrmTask: ['CO_7'] },
];
const relations = (over: Partial<ColdRelations> = {}): ColdRelations => ({
    deals: DEALS,
    openBaseDeals: DEALS.filter(d => d.CATEGORY_ID === '17'),
    dealIds: DEALS.map(d => Number(d.ID)),
    leadIds: [],
    tasks: TASKS as never,
    pres: {
        info: PRES_INFO,
        rows: [
            { id: 11, ufCrm7BaseDeal: 'D_500' },
            { id: 12, ufCrm7Deal: 610 },
        ],
    },
    zpr: { info: ZPR_INFO, rows: [{ id: 21, ufCrm8BaseDeal: 600 }] },
    ...over,
});

const target = (over: Partial<ColdTarget> = {}): ColdTarget => ({
    hookKey: 'h1',
    hook,
    kind: 'company',
    company: { ID: '7' } as never,
    companyId: 7,
    entryDeal: DEALS[1],
    rootDealId: 600,
    ...over,
});

const PROCEED: ColdStartDecision = {
    mode: 'proceed',
    foreign: [],
    takenEntry: null,
    reason: '',
};
const YIELD: ColdStartDecision = {
    mode: 'yield',
    foreign: [{ dealId: 500, responsibleId: 448 }],
    takenEntry: null,
    reason: '',
};

const closeWith = (
    fake: ReturnType<typeof makeBitrix>,
    t: ColdTarget,
    r: ColdRelations,
    decision: ColdStartDecision,
) => new ColdRelationsCloserV2Service(portal, fake.bitrix).close(t, r, decision);

describe('ColdRelationsCloserV2Service — proceed', () => {
    it('корень компания: всё открытое закрывается, свежая основная сохраняется', async () => {
        const fake = makeBitrix();
        const result = await closeWith(fake, target(), relations(), PROCEED);
        expect(result.preservedBaseDeal?.ID).toBe('600');
        expect(result.closedDealIds).toEqual([500, 510, 610]);
        expect(result.completedTaskIds).toEqual([1, 2, 3]);
        expect(result.closedPresIds).toEqual([11, 12]);
        expect(result.closedZprIds).toEqual([21]);
        expect(fake.callBatch).toHaveBeenCalledWith(2);
    });

    it('сделка уезжает в double/noresult своей воронки с обнулением оси планов', async () => {
        const fake = makeBitrix();
        await closeWith(fake, target(), relations(), PROCEED);
        expect(fake.dealUpdate).toHaveBeenCalledWith('xo2_close_deal_h1_500', 500, {
            STAGE_ID: 'C17:APOLOGY',
            UF_CRM_CALL_NEXT_DATE: '',
            UF_CRM_CALL_NEXT_NAME: '',
            UF_CRM_NEXT_PRES_PLAN_DATE: '',
            UF_CRM_XO_DATE: '',
        });
        expect(fake.dealUpdate).toHaveBeenCalledWith(
            'xo2_close_deal_h1_510',
            510,
            expect.objectContaining({ STAGE_ID: 'C48:NORESULT' }),
        );
    });

    it('воронка без закрывающей стадии — сделка пропускается', async () => {
        const fake = makeBitrix();
        const result = await closeWith(fake, target(), relations(), PROCEED);
        expect(result.closedDealIds).not.toContain(620);
        expect(fake.dealUpdate).not.toHaveBeenCalledWith(
            'xo2_close_deal_h1_620',
            expect.anything(),
            expect.anything(),
        );
    });

    it('элементы: презентации → pres_noresult, ЗПР → zpr_fail по entityTypeId смарта', async () => {
        const fake = makeBitrix();
        await closeWith(fake, target(), relations(), PROCEED);
        expect(fake.itemUpdate).toHaveBeenCalledWith('xo2_close_pres_h1_11', 11, '1040', {
            stageId: 'DT1040_9:NORESULT',
        });
        expect(fake.itemUpdate).toHaveBeenCalledWith('xo2_close_zpr_h1_21', 21, '1038', {
            stageId: 'DT1038_9:FAIL',
        });
    });

    it('закрывающей стадии смарта нет — элементы не трогаем', async () => {
        const fake = makeBitrix();
        const result = await closeWith(
            fake,
            target(),
            relations({
                zpr: {
                    info: { ...ZPR_INFO, stageIdByCode: {} } as never,
                    rows: [{ id: 21 }],
                },
            }),
            PROCEED,
        );
        expect(result.closedZprIds).toEqual([]);
        expect(fake.itemUpdate).not.toHaveBeenCalledWith(
            'xo2_close_zpr_h1_21',
            expect.anything(),
            expect.anything(),
            expect.anything(),
        );
    });

    it('корень сделка: сохраняется корневая основная', async () => {
        const fake = makeBitrix();
        const result = await closeWith(
            fake,
            target({ kind: 'deal', company: null, companyId: null, rootDealId: 500 }),
            relations(),
            PROCEED,
        );
        expect(result.preservedBaseDeal?.ID).toBe('500');
        expect(result.closedDealIds).toEqual([600, 510, 610]);
    });

    it('корень сделка без открытого корня: сохраняется свежая открытая основная, дубля нет', async () => {
        const fake = makeBitrix();
        // Входная — ХО-сделка без to_base_sales (rootDealId=null), своя основная 600 найдена по лиду.
        const result = await closeWith(
            fake,
            target({ kind: 'deal', company: null, companyId: null, rootDealId: null }),
            relations({ openBaseDeals: [DEALS[1]] }),
            PROCEED,
        );
        expect(result.preservedBaseDeal?.ID).toBe('600');
        expect(result.closedDealIds).not.toContain(600);
    });

    it('закрывать нечего — батч не зовётся', async () => {
        const fake = makeBitrix();
        const result = await closeWith(
            fake,
            target(),
            relations({
                deals: [DEALS[1]],
                openBaseDeals: [DEALS[1]],
                tasks: [],
                pres: { info: null, rows: [] },
                zpr: { info: null, rows: [] },
            }),
            PROCEED,
        );
        expect(result.closedDealIds).toEqual([]);
        expect(fake.callBatch).not.toHaveBeenCalled();
    });
});

describe('ColdRelationsCloserV2Service — yield', () => {
    it('закрывается только граф входной: она сама и ссылающиеся на неё', async () => {
        const fake = makeBitrix();
        const result = await closeWith(fake, target(), relations(), YIELD);
        expect(result.preservedBaseDeal).toBeNull();
        expect(result.closedDealIds).toEqual([600, 610]);
        expect(result.completedTaskIds).toEqual([2]);
        expect(result.closedPresIds).toEqual([12]);
        expect(result.closedZprIds).toEqual([21]);
    });

    it('чужая основная и её презентация не трогаются даже по ссылке входной', async () => {
        const fake = makeBitrix();
        // Входная — презентационная сделка, ссылающаяся на ЧУЖУЮ основную.
        const entry = deal('510', '48', { UF_CRM_TO_BASE_SALES: 'D_500' });
        const result = await closeWith(
            fake,
            target({ entryDeal: entry, rootDealId: 500 }),
            relations(),
            YIELD,
        );
        expect(result.closedDealIds).toEqual([510]);
        expect(result.closedPresIds).toEqual([]);
        expect(result.completedTaskIds).toEqual([]);
    });
});
