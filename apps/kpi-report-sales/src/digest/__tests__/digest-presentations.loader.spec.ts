import { DigestPresentationsLoader } from '../use-cases/digest-presentations.loader';
import { resolveDigestDealFields } from '../lib/digest-deal-fields.util';
import { portalModelMock } from './digest-list-fields.fixture';
import { DEAL_PORTAL } from './digest-deal-portal.fixture';

/**
 * Загрузчик презентаций дня: четыре выборки сделок «ОП Презентации»
 * (объединение по ID, отсев чужой воронки), продажи дня с их презентациями,
 * комплект и сумма с основной сделки, товарные строки, названия.
 */

const DAY = '2026-10-14';

const presDeal = (id: number, overrides: Record<string, unknown> = {}) => ({
    ID: String(id),
    TITLE: `Презентация ${id}`,
    CATEGORY_ID: '12',
    STAGE_ID: 'C12:WON',
    ASSIGNED_BY_ID: '2077',
    COMPANY_ID: '38947',
    CONTACT_ID: '0',
    LEAD_ID: '0',
    DATE_CREATE: '2026-10-12T09:00:00+03:00',
    MOVED_TIME: '2026-10-14T11:05:00+03:00',
    OPPORTUNITY: '0',
    UF_CRM_NEXT_PRES_PLAN_DATE: '2026-10-14T10:00:00+03:00',
    UF_CRM_LAST_PRES_PLAN_DATE: '2026-10-12T09:00:00+03:00',
    UF_CRM_LAST_PRES_DONE_DATE: '2026-10-14T11:05:00+03:00',
    UF_CRM_TO_BASE_SALES: '267683',
    ...overrides,
});

const page = (rows: unknown[]) => ({ result: rows, total: rows.length });

const createApi = (
    calls: Record<string, unknown[]>,
    batch: Record<string, unknown>,
) => {
    const added: [string, string, Record<string, unknown>][] = [];
    const api = {
        call: jest.fn(
            (method: string, params: { filter: Record<string, unknown> }) => {
                const filter = params.filter;
                if (method !== 'crm.deal.list')
                    return Promise.resolve(page([]));
                if ('STAGE_SEMANTIC_ID' in filter)
                    return Promise.resolve(page(calls.sales ?? []));
                if ('UF_CRM_TO_BASE_SALES' in filter)
                    return Promise.resolve(page(calls.salePres ?? []));
                if ('>=UF_CRM_NEXT_PRES_PLAN_DATE' in filter)
                    return Promise.resolve(page(calls.plan ?? []));
                if ('>=UF_CRM_LAST_PRES_DONE_DATE' in filter)
                    return Promise.resolve(page(calls.done ?? []));
                if ('>=DATE_CREATE' in filter)
                    return Promise.resolve(page(calls.created ?? []));
                return Promise.resolve(page(calls.moved ?? []));
            },
        ),
        addCmdBatch: jest.fn(
            (key: string, method: string, params: Record<string, unknown>) => {
                added.push([key, method, params]);
            },
        ),
        callBatchWithConcurrency: jest.fn(() => {
            const keys = added.splice(0).map(([key]) => key);
            const result = Object.fromEntries(
                keys.map(key => [key, batch[key] ?? []]),
            );
            return Promise.resolve([
                { result, result_total: {}, result_error: [], result_next: [] },
            ]);
        }),
    };
    return api;
};

describe('DigestPresentationsLoader', () => {
    const fields = resolveDigestDealFields(
        portalModelMock(DEAL_PORTAL) as never,
    );

    it('объединяет выборки по ID, отсеивает чужую воронку и «прочие», заполняет основную сделку и названия', async () => {
        const api = createApi(
            {
                plan: [presDeal(501), presDeal(777, { CATEGORY_ID: '99' })],
                done: [presDeal(501)],
                created: [
                    presDeal(502, {
                        STAGE_ID: 'C12:PLAN',
                        DATE_CREATE: '2026-10-14T09:30:00+03:00',
                        UF_CRM_LAST_PRES_PLAN_DATE: '2026-10-14T09:30:00+03:00',
                        UF_CRM_NEXT_PRES_PLAN_DATE: '2026-10-20T10:00:00+03:00',
                        UF_CRM_LAST_PRES_DONE_DATE: null,
                        MOVED_TIME: '2026-10-14T09:30:00+03:00',
                        COMPANY_ID: '0',
                        LEAD_ID: '55',
                        UF_CRM_TO_BASE_SALES: null,
                    }),
                ],
                moved: [
                    presDeal(503, {
                        STAGE_ID: 'C12:PLAN',
                        UF_CRM_NEXT_PRES_PLAN_DATE: '2026-10-25T10:00:00+03:00',
                        UF_CRM_LAST_PRES_DONE_DATE: null,
                    }),
                ],
            },
            {
                base_0: [
                    {
                        ID: '267683',
                        TITLE: 'Ромашка — Гарант',
                        OPPORTUNITY: '144000',
                        UF_CRM_1684145200: 'Юрист Максимум',
                    },
                ],
                rows_267683: {
                    productRows: [
                        { productName: 'Юрист Максимум' },
                        { productName: 'Юрист Максимум' },
                    ],
                },
                co_0: [{ ID: '38947', TITLE: 'ООО Ромашка' }],
                l_0: [{ ID: '55', TITLE: 'Лид с сайта' }],
            },
        );
        const fieldsNoBase = { ...fields, baseCategoryId: null };

        const result = await new DigestPresentationsLoader(
            api as never,
            fieldsNoBase,
        ).load(DAY);

        expect(result.items.map(item => [item.dealId, item.dayStatus])).toEqual(
            [
                [501, 'held'],
                [502, 'plannedNext'],
            ],
        );
        const held = result.items[0];
        expect(held.company).toEqual({ id: 38947, title: 'ООО Ромашка' });
        expect(held.baseDeal).toEqual({
            id: 267683,
            title: 'Ромашка — Гарант',
        });
        expect(held.complectName).toBe('Юрист Максимум');
        expect(held.complectSource).toBe('base');
        expect(held.sum).toBe(144000);
        expect(held.productNames).toEqual(['Юрист Максимум']);
        expect(result.items[1].lead).toEqual({ id: 55, title: 'Лид с сайта' });
        expect(result.warnings).toEqual([
            'Воронка «ОП Основная» не настроена — продажи дня недоступны.',
        ]);
        // Все четыре выборки ушли с воронкой презентаций.
        const presCalls = api.call.mock.calls.filter(
            call =>
                (call[1] as { filter: Record<string, unknown> }).filter
                    .CATEGORY_ID === '12',
        );
        expect(presCalls).toHaveLength(4);
    });

    it('продажи дня с презентациями по to_base_sales (ID и D_ID)', async () => {
        const api = createApi(
            {
                sales: [
                    {
                        ID: '267683',
                        TITLE: 'Ромашка — Гарант',
                        CATEGORY_ID: '0',
                        ASSIGNED_BY_ID: '2077',
                        CLOSEDATE: '2026-10-14T00:00:00+03:00',
                        OPPORTUNITY: '144000',
                        COMPANY_ID: '38947',
                    },
                ],
                salePres: [
                    presDeal(501),
                    presDeal(600, { UF_CRM_TO_BASE_SALES: 'D_999' }),
                ],
            },
            {
                rows_267683: {
                    productRows: [{ productName: 'Юрист Максимум' }],
                },
                co_0: [{ ID: '38947', TITLE: 'ООО Ромашка' }],
            },
        );

        const result = await new DigestPresentationsLoader(
            api as never,
            fields,
        ).load(DAY);

        expect(result.sales).toHaveLength(1);
        const sale = result.sales[0];
        expect(sale.complectName).toBe('Юрист Максимум');
        expect(sale.company?.title).toBe('ООО Ромашка');
        expect(sale.presentations.map(p => p.dealId)).toEqual([501]);
        const salePresCall = api.call.mock.calls.find(
            call =>
                'UF_CRM_TO_BASE_SALES' in
                (call[1] as { filter: Record<string, unknown> }).filter,
        ) as unknown[];
        expect(
            (salePresCall[1] as { filter: Record<string, unknown> }).filter
                .UF_CRM_TO_BASE_SALES,
        ).toEqual(['267683', 'D_267683']);
        expect(result.warnings).toEqual([]);
    });

    it('без воронки презентаций — пусто с предупреждением, без запросов презентаций', async () => {
        const api = createApi({}, {});
        const result = await new DigestPresentationsLoader(api as never, {
            ...fields,
            presCategoryId: null,
            baseCategoryId: null,
        }).load(DAY);
        expect(result.items).toEqual([]);
        expect(result.warnings).toHaveLength(2);
        expect(api.call).not.toHaveBeenCalled();
    });
});
