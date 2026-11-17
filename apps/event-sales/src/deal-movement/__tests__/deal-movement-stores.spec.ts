import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    DEAL_MOVEMENT_REDIS_KEYS,
    type DealMovementSnapshotPayload,
    type DealMovementStateEntry,
} from '@lib/sales-ai-analytics';
import { DealMovementRunState } from '../services/deal-movement-run-state';
import { DealMovementSnapshotStore } from '../services/deal-movement-snapshot.store';
import { DealMovementStateStore } from '../services/deal-movement-state.store';
import { encodeDealMovementEntry } from '../lib/deal-movement-state.codec';

const DOMAIN = 'garant.bitrix24.ru';

const entry: DealMovementStateEntry = {
    status: 'moving',
    notifiedStatus: 'moving',
    reasons: ['no_signals'],
    stageCode: 'sales_pres',
    amount: null,
    assignedById: 7,
    lastActivityAt: null,
    changedAt: null,
    notifiedAt: null,
    checkedAt: '2026-11-17T23:30:00.000Z',
};

const redisWith = (fields: Record<string, unknown> = {}) => ({
    hgetall: jest.fn(),
    hset: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(1),
    rename: jest.fn().mockResolvedValue('OK'),
    expire: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    eval: jest.fn().mockResolvedValue(1),
    ...fields,
});

describe('состояние по сделкам в Redis', () => {
    it('читает хеш, битые записи пропускает', async () => {
        const redis = redisWith({
            hgetall: jest.fn().mockResolvedValue({
                '10': encodeDealMovementEntry(entry),
                '11': '{битое',
            }),
        });
        const store = new DealMovementStateStore({
            getClient: () => redis,
        } as never);

        const state = await store.load(DOMAIN);

        expect(redis.hgetall).toHaveBeenCalledWith(
            DEAL_MOVEMENT_REDIS_KEYS.state(DOMAIN),
        );
        expect([...state.keys()]).toEqual(['10']);
    });

    it('пишет черновик целиком и подменяет состояние одной командой, срок 7 суток', async () => {
        const redis = redisWith();
        const store = new DealMovementStateStore({
            getClient: () => redis,
        } as never);
        const state = new Map(
            Array.from({ length: 501 }, (_, index) => [String(index), entry]),
        );

        await store.save(DOMAIN, state);

        const draft = DEAL_MOVEMENT_REDIS_KEYS.stateDraft(DOMAIN);
        expect(redis.del).toHaveBeenCalledWith(draft);
        // 501 поле — две команды HSET (по 500).
        expect(redis.hset).toHaveBeenCalledTimes(2);
        expect(redis.rename).toHaveBeenCalledWith(
            draft,
            DEAL_MOVEMENT_REDIS_KEYS.state(DOMAIN),
        );
        expect(redis.expire).toHaveBeenCalledWith(
            DEAL_MOVEMENT_REDIS_KEYS.state(DOMAIN),
            7 * 24 * 60 * 60,
        );
    });

    it('пустое состояние — ключ удаляется', async () => {
        const redis = redisWith();
        const store = new DealMovementStateStore({
            getClient: () => redis,
        } as never);

        await store.save(DOMAIN, new Map());

        expect(redis.del).toHaveBeenCalledWith(
            DEAL_MOVEMENT_REDIS_KEYS.state(DOMAIN),
        );
        expect(redis.rename).not.toHaveBeenCalled();
    });
});

describe('служебное состояние прогонов', () => {
    it('замок портала с токеном: занят — null, снимается только своим токеном', async () => {
        const redis = redisWith({
            set: jest
                .fn()
                .mockResolvedValueOnce('OK')
                .mockResolvedValueOnce(null),
        });
        const runState = new DealMovementRunState({
            getClient: () => redis,
        } as never);

        const token = await runState.lock(DOMAIN);
        expect(token).toEqual(expect.any(String));
        expect(await runState.lock(DOMAIN)).toBeNull();
        expect(redis.set).toHaveBeenCalledWith(
            DEAL_MOVEMENT_REDIS_KEYS.lock(DOMAIN),
            token,
            'EX',
            30 * 60,
            'NX',
        );

        await runState.unlock(DOMAIN, token as string);
        expect(redis.eval).toHaveBeenCalledWith(
            expect.stringContaining("redis.call('del'"),
            1,
            DEAL_MOVEMENT_REDIS_KEYS.lock(DOMAIN),
            token,
        );
    });

    it('метка последнего счёта и ход прогона: битое — null', async () => {
        const redis = redisWith({
            get: jest
                .fn()
                .mockResolvedValueOnce(
                    '{"day":"2026-11-18","at":"2026-11-17T23:30:00.000Z"}',
                )
                .mockResolvedValueOnce('{"domain":1}'),
        });
        const runState = new DealMovementRunState({
            getClient: () => redis,
        } as never);

        expect(await runState.lastRun(DOMAIN)).toEqual({
            day: '2026-11-18',
            at: '2026-11-17T23:30:00.000Z',
        });
        expect(await runState.loadStatus(DOMAIN)).toBeNull();
    });
});

describe('дневной снимок в ais', () => {
    const payload = {
        day: '2026-11-18',
        calcVersion: 'deal-movement-1.0.0',
        generatedAt: '2026-11-17T23:30:00.000Z',
    } as DealMovementSnapshotPayload;

    it('нет записи дня — создаётся в конверте снапшотов AI-аналитики', async () => {
        const ai = {
            findByDomainTypeKeys: jest.fn().mockResolvedValue([]),
            create: jest.fn().mockResolvedValue({ id: '501' }),
            update: jest.fn(),
        };
        const store = new DealMovementSnapshotStore(ai as never);

        expect(await store.save(DOMAIN, payload)).toBe('501');
        expect(ai.findByDomainTypeKeys).toHaveBeenCalledWith(
            DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.dealMovement,
            { activityIds: ['2026-11-18'] },
        );
        expect(ai.create).toHaveBeenCalledWith({
            provider: 'ai-analytics',
            app: 'ai-analytics',
            model: 'deal-movement-1.0.0',
            type: 'ai-analytics-deal-movement',
            status: 'done',
            activity_id: '2026-11-18',
            domain: DOMAIN,
            user_result: {
                managerId: null,
                paramsVersion: '',
                inputsHash: '',
                generatedAt: '2026-11-17T23:30:00.000Z',
                payload,
            },
        });
    });

    it('повтор за тот же день обновляет запись на месте', async () => {
        const ai = {
            findByDomainTypeKeys: jest
                .fn()
                .mockResolvedValue([{ id: '400', status: 'done' }]),
            create: jest.fn(),
            update: jest.fn().mockResolvedValue({}),
        };
        const store = new DealMovementSnapshotStore(ai as never);

        expect(await store.save(DOMAIN, payload)).toBe('400');
        expect(ai.create).not.toHaveBeenCalled();
        expect(ai.update).toHaveBeenCalledWith(
            '400',
            expect.objectContaining({ model: 'deal-movement-1.0.0' }),
        );
    });
});
