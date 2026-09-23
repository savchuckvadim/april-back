import { AiEntityDto } from '@lib/call-lib';
import { AI_ANALYTICS_SNAPSHOT_TYPE } from '../../contracts/snapshot-kinds.const';
import { registryDefault } from '../../params/registry.access';
import { AiAnalyticsAdminSnapshotStore } from '../ai-analytics-admin-snapshot.store';
import {
    AiAnalyticsCostService,
    monthBounds,
} from '../services/ai-analytics-cost.service';

const DOMAIN = 'april.bitrix24.ru';

function aisRecord(partial: {
    id: string;
    type: string;
    tokens: number;
    price: number;
}): AiEntityDto {
    return {
        id: partial.id,
        type: partial.type,
        domain: DOMAIN,
        activity_id: 'k',
        model: 'p2.4',
        status: 'done',
        user_id: 0,
        tokens_count: partial.tokens,
        price: partial.price,
        createdAt: new Date('2026-09-10T00:00:00.000Z'),
        user_result: null,
    } as unknown as AiEntityDto;
}

function makeService(records: AiEntityDto[]) {
    const aiService = {
        findByDomainTypesInPeriod: jest.fn().mockResolvedValue(records),
    };
    const store = new AiAnalyticsAdminSnapshotStore(aiService as never);
    return { service: new AiAnalyticsCostService(store), aiService };
}

describe('monthBounds', () => {
    it('границы месяца в UTC: [1-е, 1-е следующего)', () => {
        expect(monthBounds('2026-09')).toEqual({
            from: new Date('2026-09-01T00:00:00.000Z'),
            to: new Date('2026-10-01T00:00:00.000Z'),
        });
        expect(monthBounds('2026-12')).toEqual({
            from: new Date('2026-12-01T00:00:00.000Z'),
            to: new Date('2027-01-01T00:00:00.000Z'),
        });
    });
});

describe('AiAnalyticsCostService', () => {
    it('суммирует токены и цену по типам, записи без токенов не считает', async () => {
        const { service, aiService } = makeService([
            aisRecord({
                id: '1',
                type: AI_ANALYTICS_SNAPSHOT_TYPE.brief,
                tokens: 1000,
                price: 2,
            }),
            aisRecord({
                id: '2',
                type: AI_ANALYTICS_SNAPSHOT_TYPE.brief,
                tokens: 3000,
                price: 6,
            }),
            aisRecord({
                id: '3',
                type: AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
                tokens: 0,
                price: 0,
            }),
        ]);
        const result = await service.summary(DOMAIN, '2026-09');
        expect(result.calls).toBe(2);
        expect(result.tokens).toBe(1000 + 3000);
        expect(result.price).toBe(2 + 6);
        expect(result.byType).toHaveLength(1);
        expect(result.byType[0]).toMatchObject({
            type: AI_ANALYTICS_SNAPSHOT_TYPE.brief,
            calls: 2,
            tokens: 4000,
            price: 8,
        });

        // Окно чтения — ровно границы месяца.
        const [, , from, to] = aiService.findByDomainTypesInPeriod.mock
            .calls[0] as [string, string[], Date, Date];
        expect(from).toEqual(new Date('2026-09-01T00:00:00.000Z'));
        expect(to).toEqual(new Date('2026-10-01T00:00:00.000Z'));
    });

    it('цена реестра 0 («не задана») — оценки нет, ответ помечен estimated', async () => {
        // Дефолт реестра llm_price_per_1k по решению А.6 равен нулю.
        expect(registryDefault('llm_price_per_1k')).toBe(0);
        const { service } = makeService([
            aisRecord({
                id: '1',
                type: AI_ANALYTICS_SNAPSHOT_TYPE.brief,
                tokens: 2500,
                price: 0,
            }),
        ]);
        const result = await service.summary(DOMAIN, '2026-09');
        expect(result.pricePerThousand).toBe(0);
        expect(result.estimatedPrice).toBeNull();
        expect(result.byType[0].estimatedPrice).toBeNull();
        expect(result.estimated).toBe(true);
        // Токены при этом видны — «показываем только расход токенов».
        expect(result.tokens).toBe(2500);
    });

    it('вызовов не было — нули и пустой разрез по типам', async () => {
        const { service } = makeService([]);
        const result = await service.summary(DOMAIN, '2026-09');
        expect(result).toMatchObject({
            domain: DOMAIN,
            month: '2026-09',
            calls: 0,
            tokens: 0,
            price: 0,
            byType: [],
        });
        // Цены нет и расхода нет — числа всё равно оценка.
        expect(result.estimated).toBe(true);
    });
});
