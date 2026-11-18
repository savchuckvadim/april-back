import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { JobNames, QueueNames } from '@lib/queue';
import type { RopRunSummary } from '@lib/rop-reports/state/rop-run-summary';
import {
    AI_ANALYTICS_PERIOD_DIGEST_ROUTES,
    AiAnalyticsPeriodDigestAdminController,
} from '../controllers/period-digest.admin.controller';
import {
    AiAnalyticsPeriodDigestService,
    PERIOD_DIGEST_ADMIN_MESSAGES,
} from '../services/ai-analytics-period-digest.service';
import { PERIOD_DIGEST_JOB_OPTIONS } from '../../contracts/period-digest-run.types';

const DOMAIN = 'garant.bitrix24.ru';

const monthRun: RopRunSummary = {
    kind: 'month',
    periodKey: '2026-10',
    at: '2026-11-17T10:05:00.000Z',
    status: 'ran',
    countOnly: true,
    preview: false,
    recipients: 0,
    tasksCreated: 0,
    tasksAlreadyDone: 0,
    tasksClosed: 0,
    summary: ['Менеджеров: 12, карточек сохранено: 12'],
    warnings: [],
    error: null,
};

interface Setup {
    job?: { getState: () => Promise<string>; remove: jest.Mock } | null;
    withQueue?: boolean;
    redis?: Record<string, string>;
    settings?: Record<string, unknown>;
}

const build = (setup: Setup = {}) => {
    const dispatcher = {
        dispatch: jest.fn().mockResolvedValue({ id: 'job' }),
        getJob: jest.fn().mockResolvedValue(setup.job ?? null),
    };
    const redis = {
        get: jest.fn((key: string) =>
            Promise.resolve(setup.redis?.[key] ?? null),
        ),
    };
    const appSettings = {
        resolve: jest.fn().mockResolvedValue(
            setup.settings ?? {
                periodDigestEnabled: false,
                periodDigestCountOnly: true,
                periodDigestKinds: 'week,month',
            },
        ),
    };
    const service = new AiAnalyticsPeriodDigestService(
        { getClient: () => redis } as never,
        appSettings as never,
        setup.withQueue === false ? undefined : (dispatcher as never),
    );
    return { service, dispatcher, redis };
};

describe('итоги периода в админке: постановка подсчёта', () => {
    it('ставит джобу своей очереди event-sales с id по домену и виду периода', async () => {
        const { service, dispatcher } = build();

        const result = await service.run({
            domain: DOMAIN,
            kind: 'month',
            periodKey: '2026-10',
        });

        expect(result).toEqual({
            domain: DOMAIN,
            kind: 'month',
            periodKey: '2026-10',
            dispatched: true,
            jobId: `${DOMAIN}:period-digest:month`,
            reason: null,
        });
        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            QueueNames.EVENT_SALES_PERIOD_DIGEST_RUN,
            JobNames.EVENT_SALES_PERIOD_DIGEST_RUN,
            {
                domain: DOMAIN,
                kind: 'month',
                periodKey: '2026-10',
                requestedBy: 'admin',
            },
            `${DOMAIN}:period-digest:month`,
            PERIOD_DIGEST_JOB_OPTIONS,
        );
    });

    it('без ключа периода — последний закрытый: ключа в джобе нет', async () => {
        const { service, dispatcher } = build();

        const result = await service.run({ domain: DOMAIN, kind: 'week' });

        expect(result.periodKey).toBeNull();
        const [, , data] = dispatcher.dispatch.mock.calls[0] as unknown[];
        expect(data).toEqual({
            domain: DOMAIN,
            kind: 'week',
            requestedBy: 'admin',
        });
    });

    it('подсчёт того же вида ждёт или идёт — второй не ставится', async () => {
        const { service, dispatcher } = build({
            job: {
                getState: () => Promise.resolve('active'),
                remove: jest.fn(),
            },
        });

        const result = await service.run({ domain: DOMAIN, kind: 'week' });

        expect(result).toMatchObject({
            dispatched: false,
            reason: PERIOD_DIGEST_ADMIN_MESSAGES.alreadyQueued,
        });
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('без очереди — честный отказ «не подключено»', async () => {
        const { service } = build({ withQueue: false });

        expect(
            await service.run({ domain: DOMAIN, kind: 'week' }),
        ).toMatchObject({
            dispatched: false,
            jobId: null,
            reason: PERIOD_DIGEST_ADMIN_MESSAGES.runNotWired,
        });
    });
});

describe('итоги периода в админке: состояние', () => {
    it('настройки портала и итог последнего прогона по каждому виду', async () => {
        const { service, redis } = build({
            redis: {
                [`event-sales:period-digest:last-run:month:${DOMAIN}`]:
                    JSON.stringify(monthRun),
            },
        });

        const status = await service.status(DOMAIN);

        expect(status).toEqual({
            domain: DOMAIN,
            enabled: false,
            countOnly: true,
            kinds: ['week', 'month'],
            runs: [
                { kind: 'week', lastRun: null },
                { kind: 'month', lastRun: monthRun },
            ],
            runAvailable: true,
            hint: PERIOD_DIGEST_ADMIN_MESSAGES.hint,
        });
        expect(redis.get).toHaveBeenCalledWith(
            `event-sales:period-digest:last-run:week:${DOMAIN}`,
        );
    });

    it('битый итог в Redis и пустые виды в настройках — без ошибок', async () => {
        const { service } = build({
            redis: {
                [`event-sales:period-digest:last-run:week:${DOMAIN}`]: '{oops',
            },
            settings: {
                periodDigestEnabled: true,
                periodDigestCountOnly: false,
                periodDigestKinds: '',
            },
        });

        const status = await service.status(DOMAIN);

        expect(status).toMatchObject({
            enabled: true,
            countOnly: false,
            kinds: [],
            runs: [
                { kind: 'week', lastRun: null },
                { kind: 'month', lastRun: null },
            ],
        });
    });
});

describe('итоги периода в админке: ручки', () => {
    const route = (method: keyof AiAnalyticsPeriodDigestAdminController) => {
        const handler = AiAnalyticsPeriodDigestAdminController.prototype[
            method
        ] as object;
        return {
            path: Reflect.getMetadata(PATH_METADATA, handler) as string,
            verb: Reflect.getMetadata(METHOD_METADATA, handler) as number,
        };
    };

    it('POST period-digest и GET period-digest-status', () => {
        expect(route('run')).toEqual({
            path: AI_ANALYTICS_PERIOD_DIGEST_ROUTES.run,
            verb: RequestMethod.POST,
        });
        expect(route('status')).toEqual({
            path: AI_ANALYTICS_PERIOD_DIGEST_ROUTES.status,
            verb: RequestMethod.GET,
        });
    });
});
