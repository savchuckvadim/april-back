import { RedisService } from '@lib/core/redis/redis.service';
import { OfferWordCancelWatcher } from '../services/queue/offer-word-cancel-watcher.service';

const CANCEL_KEY = 'offer-word-ephemeral-pdf:cancel:op-1';

describe('OfferWordCancelWatcher', () => {
    let redis: { get: jest.Mock };
    let watcher: OfferWordCancelWatcher;

    beforeEach(() => {
        jest.useFakeTimers();
        redis = { get: jest.fn().mockResolvedValue(null) };
        watcher = new OfferWordCancelWatcher({
            getClient: () => redis,
        } as unknown as RedisService);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('опрашивает флаг отмены и молчит, пока его нет', async () => {
        const watch = watcher.watch('op-1');

        await jest.advanceTimersByTimeAsync(2_000);

        expect(redis.get).toHaveBeenCalledWith(CANCEL_KEY);
        expect(watch.signal.aborted).toBe(false);
        watch.stop();
    });

    it('прерывает операцию, когда флаг появился', async () => {
        const watch = watcher.watch('op-1');

        await jest.advanceTimersByTimeAsync(2_000);
        expect(watch.signal.aborted).toBe(false);

        redis.get.mockResolvedValue('1');
        await jest.advanceTimersByTimeAsync(2_000);

        expect(watch.signal.aborted).toBe(true);
        watch.stop();
    });

    it('stop прекращает опрос — интервал не течёт', async () => {
        const watch = watcher.watch('op-1');

        await jest.advanceTimersByTimeAsync(2_000);
        const callsBeforeStop = redis.get.mock.calls.length;
        watch.stop();
        await jest.advanceTimersByTimeAsync(10_000);

        expect(redis.get).toHaveBeenCalledTimes(callsBeforeStop);
    });

    it('недоступный Redis не отменяет операцию и не роняет генерацию', async () => {
        redis.get.mockRejectedValue(new Error('Redis недоступен'));
        const watch = watcher.watch('op-1');

        await jest.advanceTimersByTimeAsync(4_000);

        expect(watch.signal.aborted).toBe(false);
        watch.stop();
    });
});
