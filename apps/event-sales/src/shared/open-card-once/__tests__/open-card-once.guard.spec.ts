import { RedisService } from '@lib/core/redis/redis.service';
import {
    OPEN_CARD_ONCE_TTL_SECONDS,
    OpenCardOnceGuard,
} from '../open-card-once.guard';

const scope = {
    action: 'inn-align' as const,
    domain: 'garant.bitrix24.ru',
    dealId: 104459,
};

const setup = (broken = false) => {
    const store = new Map<string, string>();
    const calls: unknown[][] = [];
    const client = {
        get: (key: string) => {
            if (broken) return Promise.reject(new Error('Redis down'));
            return Promise.resolve(store.get(key) ?? null);
        },
        set: (...args: unknown[]) => {
            if (broken) return Promise.reject(new Error('Redis down'));
            calls.push(args);
            store.set(String(args[0]), String(args[1]));
            return Promise.resolve('OK');
        },
    };
    const redis = { getClient: () => client } as unknown as RedisService;
    return { guard: new OpenCardOnceGuard(redis), store, calls };
};

describe('OpenCardOnceGuard', () => {
    it('до отметки — не недавно; после — недавно, на 15 минут', async () => {
        const { guard, calls } = setup();

        expect(await guard.isRecent(scope)).toBe(false);
        await guard.remember(scope);
        expect(await guard.isRecent(scope)).toBe(true);
        expect(calls[0]).toEqual([
            'event-sales:open-card:inn-align:garant.bitrix24.ru:104459',
            '1',
            'EX',
            OPEN_CARD_ONCE_TTL_SECONDS,
        ]);
    });

    it('ключ с сотрудником — отметки разных людей не пересекаются', async () => {
        const { guard } = setup();
        const own = {
            ...scope,
            action: 'deal-owner-align' as const,
            userId: 447,
        };

        await guard.remember(own);

        expect(await guard.isRecent(own)).toBe(true);
        expect(await guard.isRecent({ ...own, userId: 331 })).toBe(false);
    });

    it('Redis недоступен — «не недавно», запись не падает', async () => {
        const { guard } = setup(true);
        expect(await guard.isRecent(scope)).toBe(false);
        await expect(guard.remember(scope)).resolves.toBeUndefined();
    });
});
