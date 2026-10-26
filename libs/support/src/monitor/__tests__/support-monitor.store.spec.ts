import { RedisService } from '@lib/core/redis/redis.service';
import {
    parseSupportMemory,
    SupportMonitorStore,
} from '../infrastructure/support-monitor.store';

function setup() {
    const redis = {
        mget: jest.fn(),
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
    };
    const store = new SupportMonitorStore({
        getClient: () => redis,
    } as unknown as RedisService);
    return { store, redis };
}

describe('parseSupportMemory', () => {
    it('корректная запись и мусорные уровни', () => {
        expect(
            parseSupportMemory(
                '{"announced":true,"waitingFor":10,"levels":["remind","x"]}',
            ),
        ).toEqual({ announced: true, waitingFor: 10, levels: ['remind'] });
    });

    it('испорченная запись — как будто памяти нет', () => {
        expect(parseSupportMemory(null)).toBeNull();
        expect(parseSupportMemory('не json')).toBeNull();
        expect(parseSupportMemory('{"waitingFor":1}')).toBeNull();
    });
});

describe('SupportMonitorStore', () => {
    it('память: раздельные ключи боевого и пробного режима, неделя жизни', async () => {
        const { store, redis } = setup();
        await store.saveMemory('dry', 'april-dev.bitrix24.ru', 71, {
            announced: true,
            waitingFor: null,
            levels: [],
        });
        expect(redis.set).toHaveBeenCalledWith(
            'support-monitor:dry:april-dev.bitrix24.ru:session:71',
            '{"announced":true,"waitingFor":null,"levels":[]}',
            'EX',
            604800,
        );
    });

    it('загрузка памяти пачкой; пустой список — без запроса', async () => {
        const { store, redis } = setup();
        expect((await store.loadMemories('live', 'd', [])).size).toBe(0);
        expect(redis.mget).not.toHaveBeenCalled();

        redis.mget.mockResolvedValue([
            '{"announced":true,"waitingFor":1,"levels":[]}',
            null,
        ]);
        const memories = await store.loadMemories('live', 'd', [71, 72]);
        expect(redis.mget).toHaveBeenCalledWith(
            'support-monitor:live:d:session:71',
            'support-monitor:live:d:session:72',
        );
        expect([...memories.keys()]).toEqual([71]);
    });

    it('окно просмотра ставится атомарно и чуть короче интервала', async () => {
        const { store, redis } = setup();
        expect(await store.claimPoll('d', 3)).toBe(true);
        expect(redis.set).toHaveBeenCalledWith(
            'support-monitor:poll:d',
            expect.any(String),
            'EX',
            165,
            'NX',
        );
        redis.set.mockResolvedValueOnce(null);
        expect(await store.claimPoll('d', 3)).toBe(false);
    });

    it('лок такта и тревоги раз в час', async () => {
        const { store, redis } = setup();
        expect(await store.acquireLock()).toBe(true);
        redis.set.mockResolvedValueOnce(null);
        expect(await store.acquireLock()).toBe(false);
        expect(await store.allowAlert('d')).toBe(true);
        expect(redis.set).toHaveBeenLastCalledWith(
            'support-monitor:alert:d',
            '1',
            'EX',
            3600,
            'NX',
        );
        await store.releaseLock();
        expect(redis.del).toHaveBeenCalledWith('support-monitor:lock');
    });
});
