import type { RedisService } from '@/core/redis/redis.service';
import type { TelegramService } from '@lib/telegram';
import {
    CallReviewsDigestScheduler,
    CALL_REVIEWS_DIGEST_CRON,
    CALL_REVIEWS_DIGEST_TIME_ZONE,
} from '../call-reviews-digest.scheduler';
import type {
    CallReviewsDigestResult,
    CallReviewsDigestUseCase,
} from '../call-reviews-digest.use-case';

const NOW = new Date('2026-11-19T06:00:00.000Z');

function harness(
    options: {
        lock?: 'OK' | null | Error;
        result?: CallReviewsDigestResult | Error;
    } = {},
) {
    const lock = options.lock === undefined ? 'OK' : options.lock;
    const client = {
        set: jest.fn(() =>
            lock instanceof Error
                ? Promise.reject(lock)
                : Promise.resolve(lock),
        ),
    };
    const redis = { getClient: () => client };
    const result = options.result ?? {
        day: '2026-11-18',
        parts: ['часть 1', 'часть 2'],
    };
    const digest = {
        build: jest.fn(() =>
            result instanceof Error
                ? Promise.reject(result)
                : Promise.resolve(result),
        ),
    };
    const telegram = { sendMessage: jest.fn(() => Promise.resolve()) };
    const scheduler = new CallReviewsDigestScheduler(
        redis as unknown as RedisService,
        digest as unknown as CallReviewsDigestUseCase,
        telegram as unknown as TelegramService,
    );
    return { scheduler, client, digest, telegram };
}

describe('CallReviewsDigestScheduler', () => {
    it('расписание — 09:00 по Москве', () => {
        expect(CALL_REVIEWS_DIGEST_CRON).toBe('0 0 9 * * *');
        expect(CALL_REVIEWS_DIGEST_TIME_ZONE).toBe('Europe/Moscow');
    });

    it('взял замок дня (SET NX EX) — шлёт части по порядку', async () => {
        const { scheduler, client, telegram } = harness();

        await expect(scheduler.run(NOW)).resolves.toBe(2);

        expect(client.set).toHaveBeenCalledWith(
            'ai-analytics:call-reviews-digest:2026-11-18',
            expect.any(String),
            'EX',
            expect.any(Number),
            'NX',
        );
        expect(telegram.sendMessage.mock.calls).toEqual([
            ['часть 1'],
            ['часть 2'],
        ]);
    });

    it('замок дня у другого экземпляра — не собирает и не шлёт', async () => {
        const { scheduler, digest, telegram } = harness({ lock: null });

        await expect(scheduler.run(NOW)).resolves.toBe(0);

        expect(digest.build).not.toHaveBeenCalled();
        expect(telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('Redis недоступен — не шлёт (иначе экземпляры задвоили бы сводку)', async () => {
        const { scheduler, telegram } = harness({ lock: new Error('down') });

        await expect(scheduler.run(NOW)).resolves.toBe(0);
        expect(telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('отзывов нет — не шлёт', async () => {
        const { scheduler, telegram } = harness({
            result: { day: '2026-11-18', parts: null },
        });

        await expect(scheduler.run(NOW)).resolves.toBe(0);
        expect(telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('сбой сборки не роняет крон', async () => {
        const { scheduler, telegram } = harness({ result: new Error('db') });

        await expect(scheduler.run(NOW)).resolves.toBe(0);
        expect(telegram.sendMessage).not.toHaveBeenCalled();
    });
});
