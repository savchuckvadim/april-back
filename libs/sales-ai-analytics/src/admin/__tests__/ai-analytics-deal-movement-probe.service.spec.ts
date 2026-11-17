import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { JobNames, QueueNames } from '@lib/queue';
import {
    AI_ANALYTICS_DEAL_MOVEMENT_ROUTES,
    AiAnalyticsDealMovementAdminController,
} from '../controllers/deal-movement.admin.controller';
import { AiAnalyticsDealMovementProbeDto } from '../dto/ai-analytics-deal-movement-probe.dto';
import {
    AiAnalyticsDealMovementProbeService,
    DEAL_MOVEMENT_PROBE_MESSAGES,
} from '../services/ai-analytics-deal-movement-probe.service';
import {
    DEAL_MOVEMENT_PROBE_JOB_OPTIONS,
    type DealMovementProbeResult,
} from '../../contracts/deal-movement-probe.types';
import { DEAL_MOVEMENT_REDIS_KEYS } from '../../contracts/deal-movement-run.types';

const DOMAIN = 'garant.bitrix24.ru';
const JOB_ID = `${DOMAIN}:deal-movement:probe`;

const probeResult: DealMovementProbeResult = {
    domain: DOMAIN,
    dealId: 9041,
    phase: 'done',
    startedAt: '2026-11-17T10:00:00.000Z',
    finishedAt: '2026-11-17T10:00:12.000Z',
    moments: {
        before: '2026-11-17T08:12:00.000Z',
        afterLogMessage: '2026-11-17T08:12:00.000Z',
        afterComment: '2026-11-17T10:00:10.000Z',
        logMessageAt: '2026-11-17T10:00:04.000Z',
        commentAt: '2026-11-17T10:00:10.000Z',
    },
    logMessageShifts: false,
    commentShifts: true,
    conclusions: ['Комментарий сдвигает «последнюю активность» сделки.'],
    error: null,
};

interface Setup {
    job?: { getState: () => Promise<string>; remove: jest.Mock } | null;
    withQueue?: boolean;
    redisValue?: string | null;
}

const build = (setup: Setup = {}) => {
    const dispatcher = {
        dispatch: jest.fn().mockResolvedValue({ id: 'job' }),
        getJob: jest.fn().mockResolvedValue(setup.job ?? null),
    };
    const redis = {
        get: jest.fn().mockResolvedValue(setup.redisValue ?? null),
    };
    const service = new AiAnalyticsDealMovementProbeService(
        { getClient: () => redis } as never,
        setup.withQueue === false ? undefined : (dispatcher as never),
    );
    return { service, dispatcher, redis };
};

describe('проверка записи в ленту: постановка', () => {
    it('ставит джобу проверки в очередь event-sales, без повторов', async () => {
        const { service, dispatcher } = build();

        const result = await service.probe({ domain: DOMAIN, dealId: 9041 });

        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            QueueNames.EVENT_SALES_DEAL_MOVEMENT_RUN,
            JobNames.EVENT_SALES_DEAL_MOVEMENT_PROBE,
            { domain: DOMAIN, dealId: 9041, requestedBy: 'admin' },
            JOB_ID,
            DEAL_MOVEMENT_PROBE_JOB_OPTIONS,
        );
        expect(DEAL_MOVEMENT_PROBE_JOB_OPTIONS.attempts).toBe(1);
        expect(result).toEqual({
            domain: DOMAIN,
            dealId: 9041,
            dispatched: true,
            jobId: JOB_ID,
            reason: null,
        });
    });

    it('пока проверка портала ждёт или идёт — вторая не ставится', async () => {
        const { service, dispatcher } = build({
            job: {
                getState: () => Promise.resolve('waiting'),
                remove: jest.fn(),
            },
        });

        expect(
            await service.probe({ domain: DOMAIN, dealId: 9041 }),
        ).toMatchObject({
            dispatched: false,
            reason: DEAL_MOVEMENT_PROBE_MESSAGES.alreadyQueued,
        });
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('без очереди — честный отказ', async () => {
        const { service } = build({ withQueue: false });

        expect(
            await service.probe({ domain: DOMAIN, dealId: 9041 }),
        ).toMatchObject({
            dispatched: false,
            jobId: null,
            reason: DEAL_MOVEMENT_PROBE_MESSAGES.notWired,
        });
    });

    it('номер сделки — целое больше нуля', async () => {
        const errorsOf = (body: object) =>
            validate(plainToInstance(AiAnalyticsDealMovementProbeDto, body));

        expect(await errorsOf({ domain: DOMAIN, dealId: 9041 })).toHaveLength(
            0,
        );
        expect(await errorsOf({ domain: DOMAIN, dealId: 0 })).toHaveLength(1);
        expect(await errorsOf({ domain: DOMAIN, dealId: 1.5 })).toHaveLength(1);
        expect(await errorsOf({ domain: '', dealId: 1 })).toHaveLength(1);
    });
});

describe('проверка записи в ленту: итог', () => {
    it('итог из Redis и идёт ли проверка', async () => {
        const { service, redis } = build({
            redisValue: JSON.stringify(probeResult),
            job: {
                getState: () => Promise.resolve('active'),
                remove: jest.fn(),
            },
        });

        expect(await service.status(DOMAIN)).toEqual({
            domain: DOMAIN,
            pending: true,
            result: probeResult,
        });
        expect(redis.get).toHaveBeenCalledWith(
            DEAL_MOVEMENT_REDIS_KEYS.probe(DOMAIN),
        );
    });

    it('битый или чужой итог — null, без исключений', async () => {
        expect(
            (await build({ redisValue: '{не json' }).service.status(DOMAIN))
                .result,
        ).toBeNull();
        expect(
            (
                await build({
                    redisValue: JSON.stringify({ phase: 'чужое' }),
                }).service.status(DOMAIN)
            ).result,
        ).toBeNull();
    });
});

describe('проверка записи в ленту: ручки', () => {
    const handlerOf = (method: string): object =>
        Object.getOwnPropertyDescriptor(
            AiAnalyticsDealMovementAdminController.prototype,
            method,
        )?.value as object;

    it('POST и GET deal-movement-probe', () => {
        expect(Reflect.getMetadata(PATH_METADATA, handlerOf('probe'))).toBe(
            AI_ANALYTICS_DEAL_MOVEMENT_ROUTES.probe,
        );
        expect(Reflect.getMetadata(METHOD_METADATA, handlerOf('probe'))).toBe(
            RequestMethod.POST,
        );
        expect(
            Reflect.getMetadata(PATH_METADATA, handlerOf('probeStatus')),
        ).toBe(AI_ANALYTICS_DEAL_MOVEMENT_ROUTES.probe);
        expect(
            Reflect.getMetadata(METHOD_METADATA, handlerOf('probeStatus')),
        ).toBe(RequestMethod.GET);
    });

    it('контроллер передаёт в сервис только домен и сделку', async () => {
        const probes = {
            probe: jest.fn().mockResolvedValue({}),
            status: jest.fn().mockResolvedValue({}),
        };
        const controller = new AiAnalyticsDealMovementAdminController(
            {} as never,
            probes as never,
        );

        await controller.probe({ domain: DOMAIN, dealId: 9041 });
        await controller.probeStatus({ domain: DOMAIN });

        expect(probes.probe).toHaveBeenCalledWith({
            domain: DOMAIN,
            dealId: 9041,
        });
        expect(probes.status).toHaveBeenCalledWith(DOMAIN);
    });
});
