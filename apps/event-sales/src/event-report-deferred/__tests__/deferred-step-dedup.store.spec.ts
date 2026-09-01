import {
    DEFERRED_STEP_DEDUP_TTL_SECONDS,
    DeferredStepDedupStore,
} from '../services/deferred-step-dedup.store';
import { RedisService } from '@lib/core/redis/redis.service';

/**
 * Отметка исполненных шагов — третий слой идемпотентности (после KPI-дедупа
 * и детерминированного jobId сайд-джобов). Здесь фиксируется ровно то, на
 * чём она держится: `SET NX EX` (гонка двух запросов), снятие отметки при
 * падении шага и мягкая деградация при недоступном Redis.
 */

const makeStore = (
    client: Partial<{
        set: jest.Mock;
        del: jest.Mock;
    }>,
) =>
    new DeferredStepDedupStore({
        getClient: () => client,
    } as unknown as RedisService);

describe('DeferredStepDedupStore — отметка исполненных шагов досылки', () => {
    it('первый заход занимает шаг: SET NX EX с TTL в неделю', async () => {
        const set = jest.fn(() => Promise.resolve('OK'));
        const store = makeStore({ set });

        await expect(store.reserve('portal.ru', 'op-1', 'kpi')).resolves.toBe(
            true,
        );
        expect(set).toHaveBeenCalledWith(
            'evflow:deferred:portal.ru:op-1:kpi',
            '1',
            'EX',
            DEFERRED_STEP_DEDUP_TTL_SECONDS,
            'NX',
        );
        // Неделя: конверт ждёт досылки в закрытой вкладке и сутками, а
        // повтор шага РЕАЛЬНО дублирует данные (вторая pres-сделка).
        expect(DEFERRED_STEP_DEDUP_TTL_SECONDS).toBe(7 * 24 * 3600);
    });

    it('занятый шаг не выдаётся второй раз', async () => {
        const store = makeStore({ set: jest.fn(() => Promise.resolve(null)) });

        await expect(store.reserve('portal.ru', 'op-1', 'kpi')).resolves.toBe(
            false,
        );
    });

    it('ключи разных порталов и операций не пересекаются', async () => {
        const set = jest.fn<Promise<string>, string[]>(() =>
            Promise.resolve('OK'),
        );
        const store = makeStore({ set });

        await store.reserve('a.ru', 'op-1', 'side-flow:zpr');
        await store.reserve('b.ru', 'op-1', 'side-flow:zpr');

        expect(set.mock.calls[0][0]).toBe(
            'evflow:deferred:a.ru:op-1:side-flow:zpr',
        );
        expect(set.mock.calls[1][0]).toBe(
            'evflow:deferred:b.ru:op-1:side-flow:zpr',
        );
    });

    it('упавший шаг возвращается в работу: отметка снимается', async () => {
        const del = jest.fn(() => Promise.resolve(1));
        const store = makeStore({ set: jest.fn(), del });

        await store.release('portal.ru', 'op-1', 'kpi');

        expect(del).toHaveBeenCalledWith('evflow:deferred:portal.ru:op-1:kpi');
    });

    it('Redis недоступен — шаг исполняется без дедупа, хвост не теряется', async () => {
        const store = makeStore({
            set: jest.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
            del: jest.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
        });

        await expect(store.reserve('portal.ru', 'op-1', 'kpi')).resolves.toBe(
            true,
        );
        // Снятие отметки тоже не роняет запрос.
        await expect(
            store.release('portal.ru', 'op-1', 'kpi'),
        ).resolves.toBeUndefined();
    });
});
