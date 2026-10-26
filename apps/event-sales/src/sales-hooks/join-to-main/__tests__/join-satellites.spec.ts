import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { buildJoinSatellitesPlan } from '../services/join-satellites.plan';
import {
    IJoinSatellites,
    JoinSatellitesReader,
} from '../services/join-satellites.reader';

type Row = Record<string, unknown>;

const LINK = 'UF_CRM_TO_BASE_SALES';

/** Воронки как на портале: ХО — 20, презентации — 22. */
const portal = {
    getEntityFieldByCode: (_entity: string, code: string) =>
        code === 'to_base_sales' ? { bitrixId: 'TO_BASE_SALES' } : undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
    getDealCategoryByCode: (code: PbxDealCategoryCodeEnum) =>
        code === PbxDealCategoryCodeEnum.sales_xo
            ? {
                  bitrixId: 20,
                  stages: [{ code: 'sales_xo_fail', bitrixId: 'LOSE' }],
              }
            : code === PbxDealCategoryCodeEnum.sales_presentation
              ? { bitrixId: 22, stages: [] }
              : undefined,
} as never;

const zpr = {
    entityTypeId: 1040,
    typeId: 7,
    ufKeyByCode: { ZPR_BASE_DEAL: 'ufCrm7BaseDeal' },
    stageIdByCode: {},
} as never;

const satellites = (over: Partial<IJoinSatellites>): IJoinSatellites => ({
    deals: [],
    zprItemIds: [],
    zpr: null,
    warnings: [],
    ...over,
});

/**
 * «Присоединить сюда» со спутниками (владелец 26.10.2026): ХО дубля
 * закрываются, презентации и открытые ЗПР переходят к основной.
 */
describe('buildJoinSatellitesPlan', () => {
    it('открытая ХО — в fail, закрытая не трогается; презентации — к основной', () => {
        const plan = buildJoinSatellitesPlan(
            portal,
            satellites({
                deals: [
                    {
                        id: 11,
                        categoryCode: PbxDealCategoryCodeEnum.sales_xo,
                        closed: false,
                    },
                    {
                        id: 12,
                        categoryCode: PbxDealCategoryCodeEnum.sales_xo,
                        closed: true,
                    },
                    {
                        id: 13,
                        categoryCode:
                            PbxDealCategoryCodeEnum.sales_presentation,
                        closed: true,
                    },
                ],
            }),
            42423,
        );

        expect(plan.ops.slice(0, 2)).toEqual([
            {
                kind: 'dealUpdate',
                dealId: 11,
                fields: { STAGE_ID: 'C20:LOSE' },
            },
            { kind: 'dealUpdate', dealId: 13, fields: { [LINK]: '42423' } },
        ]);
        expect(plan).toMatchObject({
            xoClosed: 1,
            presentationsRelinked: 1,
            zprRelinked: 0,
        });
        expect(plan.ops[2]).toMatchObject({
            kind: 'timeline',
            dealId: 42423,
            key: 'jm_tl_sat_42423',
        });
    });

    it('открытые ЗПР — родитель и наша связь на основную', () => {
        const plan = buildJoinSatellitesPlan(
            portal,
            satellites({ zprItemIds: [501], zpr }),
            42423,
        );

        expect(plan.ops[0]).toEqual({
            kind: 'itemUpdate',
            entityTypeId: 1040,
            itemId: 501,
            fields: { parentId2: 42423, ufCrm7BaseDeal: 42423 },
        });
        expect(plan.zprRelinked).toBe(1);
    });

    it('спутников нет — ни команд, ни записи в ленту', () => {
        const plan = buildJoinSatellitesPlan(portal, satellites({}), 42423);
        expect(plan.ops).toEqual([]);
    });
});

describe('JoinSatellitesReader', () => {
    it('берёт только сделки, ссылающиеся на дубль, и открытые ЗПР с дублем-родителем', async () => {
        const calls: { method: string; params: Row }[] = [];
        const bitrix = {
            api: {
                call: (method: string, params: Row) => {
                    calls.push({ method, params });
                    if (method === 'crm.deal.list') {
                        return Promise.resolve({
                            result: [
                                {
                                    ID: '11',
                                    CATEGORY_ID: '20',
                                    CLOSED: 'N',
                                    [LINK]: '87955',
                                },
                                // Портал проигнорировал фильтр — чужая ссылка отсеивается.
                                {
                                    ID: '14',
                                    CATEGORY_ID: '22',
                                    CLOSED: 'N',
                                    [LINK]: '1',
                                },
                            ],
                        });
                    }
                    return Promise.resolve({
                        result: { items: [{ id: 501, parentId2: 87955 }] },
                    });
                },
            },
        };
        const zprWithStages = {
            ...(zpr as object),
            stageIdByCode: { zpr_plan: 'DT1040_9:NEW' },
        } as never;

        const result = await new JoinSatellitesReader(
            bitrix as never,
            portal,
        ).read(87955, zprWithStages);

        expect(result.deals).toEqual([
            {
                id: 11,
                categoryCode: PbxDealCategoryCodeEnum.sales_xo,
                closed: false,
            },
        ]);
        expect(result.zprItemIds).toEqual([501]);
        expect(calls[0].params.filter).toEqual({
            [LINK]: 87955,
            CATEGORY_ID: [20, 22],
        });
    });
});
