import type {
    DealMovementDealsSnapshotPayload,
    DealMovementProblemDeal,
} from '@lib/sales-ai-analytics';
import {
    dealMovementDealsQueryOf,
    presentDealMovementDeals,
} from '../deal-movement-deals.presenter';
import { DealMovementDealsUseCase } from '../deal-movement-deals.use-case';
import { dealMovementScopeOf } from '../deal-movement-scope';
import { DEAL_MOVEMENT_TEXTS } from '../deal-movement-vitrina.const';
import { CUP, OP } from './deal-movement.fixtures';

const DOMAIN = 'april.bitrix24.ru';

const deal = (
    dealId: string,
    fields: Partial<DealMovementProblemDeal> = {},
): DealMovementProblemDeal => ({
    dealId,
    managerId: '447',
    status: 'stuck',
    title: `Сделка ${dealId}`,
    amount: 100_000,
    stageCode: 'sales_pres',
    stageTitle: 'Презентация',
    daysInStage: 30,
    stageLimitDays: 21,
    stageLimitSource: 'default',
    reasons: 'дольше срока стадии',
    since: null,
    ...fields,
});

const RECORD: DealMovementDealsSnapshotPayload = {
    form: 1,
    day: '2026-11-20',
    generatedAt: '2026-11-19T23:41:00.000Z',
    calcVersion: 'deal-movement-v3',
    perGroup: 30,
    groups: [
        { managerId: '447', status: 'stuck', total: 40, shown: 3 },
        { managerId: '447', status: 'at_risk', total: 1, shown: 1 },
        { managerId: '900', status: 'stuck', total: 1, shown: 1 },
    ],
    deals: [
        deal('1', { amount: 10_000 }),
        deal('2', { amount: 300_000, since: '2026-11-15T23:30:00.000Z' }),
        deal('3', { amount: null }),
        deal('4', { status: 'at_risk', amount: 50_000 }),
        deal('5', { managerId: '900', amount: 1_000_000 }),
    ],
};

describe('проблемные сделки последней ночи', () => {
    it('периметр, порядок по сумме, ссылка, подписи и группы «показаны из»', () => {
        const page = presentDealMovementDeals({
            record: RECORD,
            domain: DOMAIN,
            scope: dealMovementScopeOf(OP, undefined),
            query: dealMovementDealsQueryOf({}),
            names: { '447': 'Иванова Анна' },
        });

        expect(page.items.map(item => item.dealId)).toEqual([
            '2',
            '4',
            '1',
            '3',
        ]);
        expect(page.items[0]).toMatchObject({
            url: 'https://april.bitrix24.ru/crm/deal/details/2/',
            managerName: 'Иванова Анна',
            statusTitle: 'Без продвижения',
            stageTitle: 'Презентация',
            since: '2026-11-15T23:30:00.000Z',
        });
        expect(page.total).toBe(4);
        expect(page.groups.map(group => group.managerId)).toEqual([
            '447',
            '447',
        ]);
        expect(page.limited).toBe(true);
        expect(page.note).toBeNull();
    });

    it('фильтр статусов и страница', () => {
        const page = presentDealMovementDeals({
            record: RECORD,
            domain: DOMAIN,
            scope: dealMovementScopeOf(CUP, undefined),
            query: dealMovementDealsQueryOf({
                statuses: ['stuck'],
                page: 2,
                pageSize: 2,
            }),
            names: {},
        });

        expect(page.total).toBe(4);
        expect(page.items.map(item => item.dealId)).toEqual(['1', '3']);
        expect(page.page).toBe(2);
        expect(page.pageSize).toBe(2);
        expect(page.groups.every(group => group.status === 'stuck')).toBe(true);
    });

    it('размер страницы не выше потолка, страница с 1', () => {
        expect(dealMovementDealsQueryOf({ page: 0, pageSize: 1000 })).toEqual({
            statuses: null,
            page: 1,
            pageSize: 100,
        });
    });

    it('списка ещё нет — пустая страница с пояснением', async () => {
        const useCase = new DealMovementDealsUseCase(
            { problemDeals: jest.fn().mockResolvedValue(null) } as never,
            { names: jest.fn().mockResolvedValue({}) } as never,
            {
                remember: jest.fn(
                    async (
                        _key: string,
                        _ttl: number,
                        compute: () => unknown,
                    ) => ({
                        value: await compute(),
                        fromCache: false,
                    }),
                ),
            } as never,
        );

        const response = await useCase.execute(
            { domain: DOMAIN, requesterUserId: '1' },
            CUP,
        );

        expect(response.status).toBe('ready');
        expect(response.data).toMatchObject({
            day: null,
            items: [],
            total: 0,
            note: DEAL_MOVEMENT_TEXTS.noDeals,
        });
    });
});
