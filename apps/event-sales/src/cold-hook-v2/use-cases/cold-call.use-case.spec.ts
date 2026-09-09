import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { IPBXList } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { SalesBatchGroupBuffer as ColdHookBatchGroupBuffer } from '../../shared/batch';
import {
    EnumColdCallEntityType,
    EnumColdCallForce,
    EnumColdCallIsTmc,
} from '../dto/cold.dto';
import { ColdTarget } from '../services/target/cold-target.types';
import { ColdCallV2UseCase } from './cold-call.use-case';

/**
 * Создание холодной работы (шаг 6 плана v2): корень-компания — команды как
 * v1 плюс ссылка ХО-сделки на основную; корень-сделка — без COMPANY_ID, с
 * контактом/лидом входной, задача и KPI-строки привязаны через сделки.
 */
type Row = Record<string, unknown>;

const stage = (code: string, bitrixId: string) => ({ code, bitrixId });
const CATEGORIES = [
    {
        bitrixId: '17',
        code: 'sales_base',
        stages: [stage('sales_cold', 'PREPARATION')],
    },
    { bitrixId: '32', code: 'sales_xo', stages: [stage('cold_plan', 'PLAN')] },
];

const list = (type: string): IPBXList =>
    ({
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
            {
                type: 'crm',
                code: `sales_${type}_crm_company`,
                name: 'Компания',
                title: 'Компания',
                bitrixId: 'PROPERTY_COMPANY',
                bitrixCamelId: 'PROPERTY_COMPANY',
                items: [],
            },
        ],
    }) as unknown as IPBXList;

const portal = {
    getTimezone: () => 'Europe/Moscow',
    getSalesTaskGroupId: () => 41,
    getDealCategoryByCode: (code: string) =>
        CATEGORIES.find(c => c.code === code),
    getDealCategories: () => CATEGORIES,
    getEntityFieldByCode: (_entity: string, code: string) =>
        code === 'to_base_sales'
            ? { bitrixId: 'TO_BASE_SALES', items: [] }
            : undefined,
    getListByCode: (code: string) =>
        list(code === 'sales_kpi' ? 'kpi' : 'history'),
} as unknown as PortalModel;

const makeBitrix = () => {
    const fns = {
        companyUpdate: jest.fn(),
        dealSet: jest.fn(),
        dealUpdate: jest.fn(),
        taskAdd: jest.fn(),
        listAdd: jest.fn(),
    };
    const bitrix = {
        batch: {
            company: { update: fns.companyUpdate },
            deal: { set: fns.dealSet, update: fns.dealUpdate },
            task: { add: fns.taskAdd },
            listItem: { add: fns.listAdd },
        },
    } as unknown as BitrixService;
    return { bitrix, ...fns };
};

/** Буфер: копит замыкания, endGroup исполняет их (как реальный, без HTTP). */
const makeBuffer = () => {
    const queued: Array<() => void> = [];
    return {
        queue: (fn: () => void) => queued.push(fn),
        endGroup: async () => {
            queued.forEach(fn => fn());
            queued.length = 0;
        },
    } as unknown as ColdHookBatchGroupBuffer;
};

const hook = (entityType: EnumColdCallEntityType, entityId: string) => ({
    entityType,
    entityId,
    responsible: '447',
    created: '1',
    deadline: '05.09.2026 11:00:00',
    name: 'ООО Ромашка',
    isTmc: EnumColdCallIsTmc.N,
    force: EnumColdCallForce.N,
});

const companyTarget: ColdTarget = {
    hookKey: 'h1',
    hook: hook(EnumColdCallEntityType.COMPANY, '7'),
    kind: 'company',
    company: { ID: '7' } as never,
    companyId: 7,
    entryDeal: null,
    rootDealId: null,
};

const ENTRY: Row = {
    ID: '600',
    CATEGORY_ID: '48',
    COMPANY_ID: '',
    CONTACT_ID: '9',
    LEAD_ID: '12',
};
const dealTarget: ColdTarget = {
    hookKey: 'h2',
    hook: hook(EnumColdCallEntityType.DEAL, '600'),
    kind: 'deal',
    company: null,
    companyId: null,
    entryDeal: ENTRY as never,
    rootDealId: null,
};

const run = async (target: ColdTarget, baseDeal: IBXDeal | null) => {
    const fake = makeBitrix();
    await new ColdCallV2UseCase(portal, fake.bitrix).flow(
        target,
        baseDeal,
        null,
        makeBuffer(),
    );
    return fake;
};

describe('ColdCallV2UseCase — корень компания', () => {
    it('владелец-компания обновляется, основная — update с COMPANY_ID, ХО — set со ссылкой на основную', async () => {
        const fake = await run(companyTarget, { ID: '500' } as never);
        expect(fake.companyUpdate).toHaveBeenCalledWith(
            'xo_hook_update_event_entity_company_7',
            '7',
            expect.any(Object),
        );
        expect(fake.dealUpdate).toHaveBeenCalledWith(
            'update_base_deal_500',
            500,
            expect.objectContaining({
                CATEGORY_ID: '17',
                STAGE_ID: 'C17:PREPARATION',
                COMPANY_ID: '7',
                ASSIGNED_BY_ID: '447',
            }),
        );
        expect(fake.dealSet).toHaveBeenCalledWith(
            'new_cold_deal_7',
            expect.objectContaining({
                CATEGORY_ID: '32',
                STAGE_ID: 'C32:PLAN',
                COMPANY_ID: '7',
                UF_CRM_TO_BASE_SALES: '500',
            }),
        );
        expect(fake.dealSet.mock.calls[0][1]).not.toHaveProperty('CONTACT_ID');
    });

    it('задача и KPI-строки привязаны к компании и обеим сделкам', async () => {
        const fake = await run(companyTarget, { ID: '500' } as never);
        expect(fake.taskAdd).toHaveBeenCalledWith(
            'bx_task_add_7',
            expect.objectContaining({
                UF_CRM_TASK: ['CO_7', 'D_500', 'D_$result[new_cold_deal_7]'],
                GROUP_ID: 41,
                RESPONSIBLE_ID: 447,
            }),
        );
        expect(fake.listAdd).toHaveBeenCalledTimes(2);
        const [, dto] = fake.listAdd.mock.calls[0];
        expect(dto.FIELDS.PROPERTY_CRM).toEqual({
            n0: 'CO_7',
            n1: 'D_500',
            n2: 'D_$result[new_cold_deal_7]',
        });
        expect(dto.FIELDS.PROPERTY_COMPANY).toEqual({ n0: 'CO_7' });
    });

    it('основной нет — создаётся новая, ХО ссылается на $result', async () => {
        const fake = await run(companyTarget, null);
        expect(fake.dealSet).toHaveBeenCalledWith(
            'new_base_deal_7',
            expect.objectContaining({ CATEGORY_ID: '17', COMPANY_ID: '7' }),
        );
        expect(fake.dealSet).toHaveBeenCalledWith(
            'new_cold_deal_7',
            expect.objectContaining({
                UF_CRM_TO_BASE_SALES: '$result[new_base_deal_7]',
            }),
        );
    });
});

describe('ColdCallV2UseCase — корень сделка без компании', () => {
    it('владельца-компании нет, сделки без COMPANY_ID, с контактом и лидом входной', async () => {
        const fake = await run(dealTarget, null);
        expect(fake.companyUpdate).not.toHaveBeenCalled();
        expect(fake.dealSet).toHaveBeenCalledWith(
            'new_base_deal_deal_600',
            expect.objectContaining({
                CATEGORY_ID: '17',
                CONTACT_ID: '9',
                LEAD_ID: '12',
                ASSIGNED_BY_ID: '447',
            }),
        );
        expect(fake.dealSet).toHaveBeenCalledWith(
            'new_cold_deal_deal_600',
            expect.objectContaining({
                CATEGORY_ID: '32',
                CONTACT_ID: '9',
                LEAD_ID: '12',
                UF_CRM_TO_BASE_SALES: '$result[new_base_deal_deal_600]',
            }),
        );
        for (const [, payload] of fake.dealSet.mock.calls) {
            expect(payload).not.toHaveProperty('COMPANY_ID');
        }
    });

    it('задача привязана к сделкам и лиду, KPI — без компании', async () => {
        const fake = await run(dealTarget, null);
        expect(fake.taskAdd).toHaveBeenCalledWith(
            'bx_task_add_deal_600',
            expect.objectContaining({
                UF_CRM_TASK: [
                    'D_$result[new_base_deal_deal_600]',
                    'D_$result[new_cold_deal_deal_600]',
                    'L_12',
                ],
            }),
        );
        const [, dto] = fake.listAdd.mock.calls[0];
        expect(dto.FIELDS.PROPERTY_CRM).toEqual({
            n0: 'D_$result[new_base_deal_deal_600]',
            n1: 'D_$result[new_cold_deal_deal_600]',
            n2: 'L_12',
        });
        expect(dto.FIELDS).not.toHaveProperty('PROPERTY_COMPANY');
        expect(dto.ELEMENT_CODE.startsWith('kpi_deal_600_')).toBe(true);
    });

    it('сохранённая корневая основная обновляется без перезаписи её связей', async () => {
        const fake = await run({ ...dealTarget, rootDealId: 77 }, {
            ID: '77',
        } as never);
        expect(fake.dealUpdate).toHaveBeenCalledWith(
            'update_base_deal_77',
            77,
            expect.objectContaining({ STAGE_ID: 'C17:PREPARATION' }),
        );
        const [, , payload] = fake.dealUpdate.mock.calls[0];
        expect(payload).not.toHaveProperty('CONTACT_ID');
        expect(payload).not.toHaveProperty('COMPANY_ID');
        expect(fake.dealSet).toHaveBeenCalledWith(
            'new_cold_deal_deal_600',
            expect.objectContaining({ UF_CRM_TO_BASE_SALES: '77' }),
        );
    });
});
