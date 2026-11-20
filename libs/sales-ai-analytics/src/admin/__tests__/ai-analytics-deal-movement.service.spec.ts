import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { JobNames, QueueNames } from '@lib/queue';
import {
    AI_ANALYTICS_DEAL_MOVEMENT_ROUTES,
    AiAnalyticsDealMovementAdminController,
} from '../controllers/deal-movement.admin.controller';
import {
    AiAnalyticsDealMovementService,
    DEAL_MOVEMENT_ADMIN_MESSAGES,
} from '../services/ai-analytics-deal-movement.service';
import {
    DEAL_MOVEMENT_JOB_OPTIONS,
    DEAL_MOVEMENT_REDIS_KEYS,
    type DealMovementRunStatus,
} from '../../contracts/deal-movement-run.types';
import type { DealMovementSnapshotPayload } from '../../contracts/deal-movement-snapshot.types';
import { AI_ANALYTICS_SNAPSHOT_TYPE } from '../../contracts/snapshot-kinds.const';

const DOMAIN = 'garant.bitrix24.ru';

const counts = {
    moving: 5,
    stuck: 2,
    abandoned: 4,
    rolled_back: 1,
    at_risk: 3,
};

const runStatus: DealMovementRunStatus = {
    domain: DOMAIN,
    mode: 'count',
    requestedBy: 'nightly',
    phase: 'done',
    startedAt: '2026-11-17T23:27:00.000Z',
    updatedAt: '2026-11-17T23:30:00.000Z',
    finished: true,
    openTotal: 11,
    evaluated: 11,
    capped: false,
    baseline: false,
    firstSeen: 1,
    byStatus: counts,
    changed: 2,
    snapshotDay: '2026-11-18',
    warnings: [],
    error: null,
};

const snapshot: DealMovementSnapshotPayload = {
    day: '2026-11-18',
    mode: 'count',
    calcVersion: 'deal-movement-1.0.0',
    generatedAt: '2026-11-17T23:30:00.000Z',
    openTotal: 11,
    evaluated: 11,
    baseline: false,
    firstSeen: 1,
    byStatus: counts,
    changes: [],
    changesTotal: 0,
    warnings: [],
};

interface Setup {
    job?: { getState: () => Promise<string>; remove: jest.Mock } | null;
    withQueue?: boolean;
    redisValue?: string | null;
    snapshots?: { payload: unknown }[];
}

const build = (setup: Setup = {}) => {
    const dispatcher = {
        dispatch: jest.fn().mockResolvedValue({ id: 'job' }),
        getJob: jest.fn().mockResolvedValue(setup.job ?? null),
    };
    const redis = {
        get: jest.fn().mockResolvedValue(setup.redisValue ?? null),
    };
    const store = { read: jest.fn().mockResolvedValue(setup.snapshots ?? []) };
    const appSettings = {
        resolve: jest.fn().mockResolvedValue({ dealMovementEnabled: true }),
    };
    const service = new AiAnalyticsDealMovementService(
        store as never,
        { getClient: () => redis } as never,
        appSettings as never,
        setup.withQueue === false ? undefined : (dispatcher as never),
    );
    return { service, dispatcher, redis, store };
};

describe('движение сделок в админке: постановка прогона', () => {
    it('ставит джобу своей очереди event-sales с id по домену и режиму', async () => {
        const { service, dispatcher } = build();

        const result = await service.run({ domain: DOMAIN, dryRun: true });

        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            QueueNames.EVENT_SALES_DEAL_MOVEMENT_RUN,
            JobNames.EVENT_SALES_DEAL_MOVEMENT_RUN,
            { domain: DOMAIN, dryRun: true, requestedBy: 'admin' },
            `${DOMAIN}:deal-movement:dry-run`,
            DEAL_MOVEMENT_JOB_OPTIONS,
        );
        expect(result).toEqual({
            domain: DOMAIN,
            dryRun: true,
            dispatched: true,
            jobId: `${DOMAIN}:deal-movement:dry-run`,
            reason: null,
        });
    });

    it('пока прогон портала ждёт или идёт — второй не ставится', async () => {
        const { service, dispatcher } = build({
            job: {
                getState: () => Promise.resolve('active'),
                remove: jest.fn(),
            },
        });

        const result = await service.run({ domain: DOMAIN, dryRun: false });

        expect(dispatcher.dispatch).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            dispatched: false,
            reason: DEAL_MOVEMENT_ADMIN_MESSAGES.alreadyQueued,
        });
    });

    it('завершённый остаток джоба снимается, новый ставится', async () => {
        const remove = jest.fn().mockResolvedValue(undefined);
        const { service, dispatcher } = build({
            job: { getState: () => Promise.resolve('completed'), remove },
        });

        await service.run({ domain: DOMAIN, dryRun: false });

        expect(remove).toHaveBeenCalled();
        expect(dispatcher.dispatch).toHaveBeenCalled();
    });

    it('без очереди — честный отказ', async () => {
        const { service } = build({ withQueue: false });

        expect(await service.run({ domain: DOMAIN, dryRun: true })).toEqual({
            domain: DOMAIN,
            dryRun: true,
            dispatched: false,
            jobId: null,
            reason: DEAL_MOVEMENT_ADMIN_MESSAGES.runNotWired,
        });
    });
});

describe('движение сделок в админке: состояние', () => {
    it('ход прогона из Redis и последний снимок из ais', async () => {
        const { service, redis, store } = build({
            redisValue: JSON.stringify(runStatus),
            snapshots: [{ payload: snapshot }],
        });

        const result = await service.status(DOMAIN);

        expect(redis.get).toHaveBeenCalledWith(
            DEAL_MOVEMENT_REDIS_KEYS.status(DOMAIN),
        );
        expect(store.read).toHaveBeenCalledWith(
            DOMAIN,
            [AI_ANALYTICS_SNAPSHOT_TYPE.dealMovement],
            { limit: 1 },
        );
        expect(result).toMatchObject({
            domain: DOMAIN,
            enabled: true,
            run: runStatus,
            lastSnapshot: snapshot,
            runAvailable: true,
        });
    });

    it('прогон и снимок до 20.11.2026 без «Без внимания» читаются, счёт — 0', async () => {
        const legacy = { moving: 5, stuck: 2, rolled_back: 1, at_risk: 3 };
        const { service } = build({
            redisValue: JSON.stringify({ ...runStatus, byStatus: legacy }),
            snapshots: [{ payload: { ...snapshot, byStatus: legacy } }],
        });

        const result = await service.status(DOMAIN);

        expect(result.run?.byStatus).toEqual({ ...legacy, abandoned: 0 });
        expect(result.lastSnapshot?.byStatus).toEqual({
            ...legacy,
            abandoned: 0,
        });
    });

    it('битый ход и чужая нагрузка снимка — null, без исключений', async () => {
        const { service } = build({
            redisValue: '{не json',
            snapshots: [{ payload: { kind: 'чужое' } }],
        });

        const result = await service.status(DOMAIN);

        expect(result.run).toBeNull();
        expect(result.lastSnapshot).toBeNull();
    });
});

describe('движение сделок в админке: ручки', () => {
    const handlerOf = (method: string): object =>
        Object.getOwnPropertyDescriptor(
            AiAnalyticsDealMovementAdminController.prototype,
            method,
        )?.value as object;

    it('POST deal-movement ставит прогон, GET deal-movement-status читает состояние', () => {
        expect(Reflect.getMetadata(PATH_METADATA, handlerOf('run'))).toBe(
            AI_ANALYTICS_DEAL_MOVEMENT_ROUTES.run,
        );
        expect(Reflect.getMetadata(METHOD_METADATA, handlerOf('run'))).toBe(
            RequestMethod.POST,
        );
        expect(Reflect.getMetadata(PATH_METADATA, handlerOf('status'))).toBe(
            AI_ANALYTICS_DEAL_MOVEMENT_ROUTES.status,
        );
        expect(Reflect.getMetadata(METHOD_METADATA, handlerOf('status'))).toBe(
            RequestMethod.GET,
        );
    });

    it('контроллер передаёт в сервис только домен и режим', async () => {
        const service = {
            run: jest.fn().mockResolvedValue({}),
            status: jest.fn().mockResolvedValue({}),
        };
        const controller = new AiAnalyticsDealMovementAdminController(
            service as never,
            {} as never,
        );

        await controller.run({ domain: DOMAIN, dryRun: false });
        await controller.status({ domain: DOMAIN });

        expect(service.run).toHaveBeenCalledWith({
            domain: DOMAIN,
            dryRun: false,
        });
        expect(service.status).toHaveBeenCalledWith(DOMAIN);
    });
});
