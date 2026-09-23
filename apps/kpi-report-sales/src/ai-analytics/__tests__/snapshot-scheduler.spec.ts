import { Logger } from '@nestjs/common';
import { DEFAULT_WORK_CALENDAR } from '@lib/sales-ai-analytics';
import {
    AI_ANALYTICS_LOCAL_HOURS,
    AI_PIPELINE_CRON,
} from '../constants/ai-cron.const';
import { AI_ANALYTICS_OVERVIEW_JOB_OPTIONS } from '../constants/ai-overview.const';
import {
    AI_PIPELINE_JOB_OPTIONS,
    AI_PIPELINE_METRICS,
    AI_PIPELINE_RETRY_DELAY_MS,
    buildPipelineJobId,
    resolvePipelineKeys,
    type AiPipelineRhythm,
} from '../constants/ai-snapshot.const';
import {
    AI_PIPELINE_TICK_SLOTS,
    AiAnalyticsSnapshotScheduler,
    freezeTickSteps,
} from '../cron/ai-analytics-snapshot.scheduler';
import { AiAnalyticsPortalsLoader } from '../domain/loaders/portals.loader';
import { AiSnapshotJobData } from '../dto/ai-snapshot.dto';
import type { AiAnalyticsPipelineStep } from '../steps/step.types';

/** Шаг глазами планировщика: код и ритмы; прогон планировщику не нужен. */
const fakeStep = (
    code: string,
    rhythms: AiPipelineRhythm[],
): AiAnalyticsPipelineStep => ({
    code,
    rhythms,
    run: () => Promise.reject(new Error('планировщик шаги не выполняет')),
});

/** Состав шагов как в проде (порядок регистрации конвейера Фазы 2). */
const STEPS: AiAnalyticsPipelineStep[] = [
    fakeStep('calls', ['nightly', 'weekly', 'monthly', 'backfill']),
    fakeStep('passport', ['nightly', 'weekly', 'monthly', 'backfill']),
    fakeStep('stage-history', ['nightly', 'weekly', 'monthly', 'backfill']),
    fakeStep('kpi', ['nightly', 'monthly', 'backfill']),
    fakeStep('style', ['monthly']),
    fakeStep('plans', ['monthly']),
    fakeStep('finance', ['nightly', 'monthly', 'backfill']),
    fakeStep('forecast', ['nightly']),
];

interface PortalFlags {
    enabled?: boolean;
    timeZone?: string;
}

/** Аргументы QueueDispatcherService.dispatch: очередь, джоба, payload, jobId, опции. */
type DispatchMock = jest.Mock<
    Promise<{ id: string }>,
    [string, string, AiSnapshotJobData, string, object]
>;

function makeScheduler(
    portals: Record<string, PortalFlags>,
    steps: readonly AiAnalyticsPipelineStep[] = STEPS,
) {
    const appSettings = {
        listByAppCode: jest
            .fn()
            .mockResolvedValue(
                Object.keys(portals).map(domain => ({ domain, portalId: 1 })),
            ),
    };
    const settings = {
        load: jest.fn((domain: string) => {
            const flags = portals[domain];
            if (!flags) return Promise.reject(new Error('portal not found'));
            return Promise.resolve({
                enabled: flags.enabled ?? true,
                calendar: {
                    ...DEFAULT_WORK_CALENDAR,
                    timeZone: flags.timeZone ?? DEFAULT_WORK_CALENDAR.timeZone,
                },
            });
        }),
    };
    const dispatcher = {
        dispatch: jest.fn<
            Promise<{ id: string }>,
            [string, string, AiSnapshotJobData, string, object]
        >(() => Promise.resolve({ id: 'x' })),
    };
    const backfill = { dispatch: jest.fn().mockResolvedValue([]) };
    return {
        scheduler: new AiAnalyticsSnapshotScheduler(
            new AiAnalyticsPortalsLoader(appSettings as never),
            settings as never,
            dispatcher as never,
            backfill as never,
            steps,
        ),
        dispatcher,
        backfill,
    };
}

/** payload джобы n-го вызова dispatch. */
function jobData(
    dispatcher: { dispatch: DispatchMock },
    call = 0,
): AiSnapshotJobData {
    return dispatcher.dispatch.mock.calls[call][2];
}

const ENABLED = {
    'a.bitrix24.ru': { enabled: true },
    'off.bitrix24.ru': { enabled: false },
};

/** 8 сентября 2026 (вторник) 00:45 UTC = 03:45 МСК. */
const NIGHT = new Date('2026-09-08T00:45:00Z');
/** 7 сентября 2026 (понедельник) 00:15 UTC = 03:15 МСК. */
const MONDAY = new Date('2026-09-07T00:15:00Z');
/** 3 октября 2026 01:00 UTC = 04:00 МСК. */
const THIRD = new Date('2026-10-03T01:00:00Z');
/** 1 сентября 2026 01:00 UTC = 04:00 МСК. */
const FIRST = new Date('2026-09-01T01:00:00Z');

describe('AiAnalyticsSnapshotScheduler — ритмы ночного конвейера', () => {
    it('тики ежечасные на минуте слота; слоты — локальные 03:45 / пн 03:15 / 3-е 04:00 / 1-е 04:00', () => {
        expect(AI_PIPELINE_CRON).toEqual({
            NIGHTLY: '45 * * * *',
            WEEKLY: '15 * * * *',
            MONTHLY: '0 * * * *',
            PLANS: '0 * * * *',
        });
        expect(AI_PIPELINE_TICK_SLOTS).toEqual({
            nightly: { hour: 3, minute: 45 },
            weekly: { hour: 3, minute: 15, weekday: 1 },
            monthly: { hour: 4, minute: 0, dayOfMonth: 3 },
            plans: { hour: 4, minute: 0, dayOfMonth: 1 },
        });
        expect(AI_PIPELINE_TICK_SLOTS.nightly).toBe(
            AI_ANALYTICS_LOCAL_HOURS.NIGHTLY,
        );
    });

    it('три ритма ставят по одной джобе на портал с ai_analytics_enabled', async () => {
        const nightly = makeScheduler(ENABLED);
        const weekly = makeScheduler(ENABLED);
        const monthly = makeScheduler(ENABLED);

        expect(await nightly.scheduler.dispatchAll('nightly', NIGHT)).toEqual([
            'ai-analytics:snapshot:nightly:a.bitrix24.ru:2026-09-08',
        ]);
        expect(await weekly.scheduler.dispatchAll('weekly', MONDAY)).toEqual([
            'ai-analytics:snapshot:weekly:a.bitrix24.ru:2026-W36',
        ]);
        expect(await monthly.scheduler.dispatchAll('monthly', THIRD)).toEqual([
            'ai-analytics:snapshot:monthly:a.bitrix24.ru:2026-09',
        ]);
        for (const run of [nightly, weekly, monthly]) {
            expect(run.dispatcher.dispatch).toHaveBeenCalledTimes(1);
        }
    });

    it('два портала в разных поясах: ночной пересчёт уходит в свои 03:45, т.е. в разные часы UTC', async () => {
        const { scheduler, dispatcher } = makeScheduler({
            'msk.bitrix24.ru': { enabled: true },
            'nsk.bitrix24.ru': { enabled: true, timeZone: 'Asia/Novosibirsk' },
        });
        // 07.09 20:45Z: в Новосибирске (UTC+7) уже 08.09 03:45, в Москве 23:45.
        expect(
            await scheduler.dispatchAll(
                'nightly',
                new Date('2026-09-07T20:45:00Z'),
            ),
        ).toEqual(['ai-analytics:snapshot:nightly:nsk.bitrix24.ru:2026-09-08']);
        // 08.09 00:45Z: в Москве 03:45, в Новосибирске 07:45 — слот прошёл.
        expect(await scheduler.dispatchAll('nightly', NIGHT)).toEqual([
            'ai-analytics:snapshot:nightly:msk.bitrix24.ru:2026-09-08',
        ]);
        // Тик в час, когда ни у кого не 03:45, — джоб нет.
        expect(
            await scheduler.dispatchAll(
                'nightly',
                new Date('2026-09-08T03:45:00Z'),
            ),
        ).toEqual([]);
        expect(dispatcher.dispatch).toHaveBeenCalledTimes(2);
        expect(jobData(dispatcher, 0).day).toBe('2026-09-08');
        expect(jobData(dispatcher, 1).day).toBe('2026-09-08');
    });

    it('ключи периода: недельный ритм считает закончившуюся неделю, месячный — закрытый месяц', async () => {
        const weekly = makeScheduler(ENABLED);
        await weekly.scheduler.dispatchAll('weekly', MONDAY);
        expect(jobData(weekly.dispatcher)).toEqual({
            domain: 'a.bitrix24.ru',
            kind: 'weekly',
            day: '2026-09-07',
            weekKey: '2026-W36',
            monthKey: '2026-09',
        });

        const monthly = makeScheduler(ENABLED);
        await monthly.scheduler.dispatchAll('monthly', THIRD);
        expect(jobData(monthly.dispatcher)).toMatchObject({
            kind: 'monthly',
            day: '2026-10-03',
            monthKey: '2026-09',
        });
        expect(resolvePipelineKeys('nightly', '2026-10-03').monthKey).toBe(
            '2026-10',
        );
    });

    it('повторный тик того же часа даёт тот же jobId (Bull дедуплицирует); тик в другой час — 0 новых джоб', async () => {
        const { scheduler, dispatcher } = makeScheduler(ENABLED);
        const first = await scheduler.dispatchAll('nightly', NIGHT);
        const again = await scheduler.dispatchAll(
            'nightly',
            new Date(NIGHT.getTime() + 60_000),
        );
        expect(again).toEqual(first);
        expect(dispatcher.dispatch.mock.calls[0][3]).toBe(
            dispatcher.dispatch.mock.calls[1][3],
        );
        // 06:00 МСК той же даты — слот 03:45 уже прошёл.
        expect(
            await scheduler.dispatchAll(
                'nightly',
                new Date('2026-09-08T03:00:00Z'),
            ),
        ).toEqual([]);
        expect(dispatcher.dispatch).toHaveBeenCalledTimes(2);
    });

    it('снимок планов 1-го числа: ритм monthly, свой ключ и только шаг планов', async () => {
        const { scheduler, dispatcher } = makeScheduler(ENABLED);
        expect(await scheduler.dispatchAll('plans', FIRST)).toEqual([
            'ai-analytics:snapshot:monthly:a.bitrix24.ru:plans-2026-09',
        ]);
        expect(jobData(dispatcher)).toEqual({
            domain: 'a.bitrix24.ru',
            kind: 'monthly',
            day: '2026-09-01',
            weekKey: '2026-W36',
            monthKey: '2026-09',
            steps: ['plans'],
        });
        // ключ снимка планов не совпадает с ключом заморозки того же месяца
        expect(
            buildPipelineJobId('monthly', 'a.bitrix24.ru', '2026-09'),
        ).not.toBe(dispatcher.dispatch.mock.calls[0][3]);
        // тот же час 3-го числа — это тик заморозки, а не планов
        expect(await scheduler.dispatchAll('plans', THIRD)).toEqual([]);
    });

    it('тик заморозки 3-го числа: белый список всех месячных шагов без снимка планов', async () => {
        const { scheduler, dispatcher } = makeScheduler(ENABLED);

        await scheduler.dispatchAll('monthly', THIRD);

        const monthlyCodes = STEPS.filter(step =>
            step.rhythms.includes('monthly'),
        ).map(step => step.code);
        expect(monthlyCodes).toContain('plans');
        expect(freezeTickSteps(STEPS)).toEqual(
            monthlyCodes.filter(code => code !== 'plans'),
        );
        expect(jobData(dispatcher)).toEqual({
            domain: 'a.bitrix24.ru',
            kind: 'monthly',
            day: '2026-10-03',
            weekKey: '2026-W40',
            monthKey: '2026-09',
            steps: [
                'calls',
                'passport',
                'stage-history',
                'kpi',
                'style',
                'finance',
            ],
        });
    });

    it('ночной и недельный тики белого списка не несут; без зарегистрированных шагов список не ставится', async () => {
        const nightly = makeScheduler(ENABLED);
        const weekly = makeScheduler(ENABLED);
        const bare = makeScheduler(ENABLED, []);

        await nightly.scheduler.dispatchAll('nightly', NIGHT);
        await weekly.scheduler.dispatchAll('weekly', MONDAY);
        await bare.scheduler.dispatchAll('monthly', THIRD);

        expect(jobData(nightly.dispatcher).steps).toBeUndefined();
        expect(jobData(weekly.dispatcher).steps).toBeUndefined();
        expect(freezeTickSteps([])).toEqual([]);
        expect(jobData(bare.dispatcher).steps).toBeUndefined();
    });

    it('опции джобы как в плане; пользовательские джобы обзора не задеты', async () => {
        const { scheduler, dispatcher } = makeScheduler(ENABLED);
        await scheduler.dispatchAll('nightly', NIGHT);
        expect(dispatcher.dispatch.mock.calls[0][4]).toBe(
            AI_PIPELINE_JOB_OPTIONS,
        );
        expect(AI_PIPELINE_JOB_OPTIONS).toEqual({
            priority: 10,
            attempts: 2,
            backoff: 300_000,
            timeout: 900_000,
            removeOnComplete: 50,
            removeOnFail: 20,
        });
        expect(AI_ANALYTICS_OVERVIEW_JOB_OPTIONS.attempts).toBe(1);
        expect(AI_ANALYTICS_OVERVIEW_JOB_OPTIONS.priority).toBeLessThan(
            AI_PIPELINE_JOB_OPTIONS.priority,
        );
        expect(AI_PIPELINE_RETRY_DELAY_MS).toBe(60_000);
        expect(AI_PIPELINE_METRICS).toEqual([
            'ai_analytics_job_duration',
            'ai_analytics_rows_loaded',
            'ai_analytics_bitrix_calls',
            'ai_analytics_llm_price',
        ]);
    });

    it('ошибка одного портала логируется с пометкой телеграма, обход продолжается', async () => {
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        const { scheduler, dispatcher } = makeScheduler({
            'a.bitrix24.ru': { enabled: true },
        });
        (
            scheduler as unknown as {
                portals: { listDomains: () => Promise<string[]> };
            }
        ).portals.listDomains = () =>
            Promise.resolve(['broken.bitrix24.ru', 'a.bitrix24.ru']);

        const jobIds = await scheduler.dispatchAll('nightly', NIGHT);

        expect(jobIds).toEqual([
            'ai-analytics:snapshot:nightly:a.bitrix24.ru:2026-09-08',
        ]);
        expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalledWith(
            expect.stringContaining('broken.bitrix24.ru'),
            { telegram: true, domain: 'broken.bitrix24.ru' },
        );
        error.mockRestore();
    });

    it('в логах тика — по одной строке на портал с локальным временем и поясом', async () => {
        const log = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);
        const { scheduler } = makeScheduler({
            'msk.bitrix24.ru': { enabled: true },
            'nsk.bitrix24.ru': { enabled: true, timeZone: 'Asia/Novosibirsk' },
        });

        await scheduler.dispatchAll('nightly', NIGHT);

        const perPortal = log.mock.calls
            .map(([message]) => String(message))
            .filter(message => message.includes('локально'));
        expect(perPortal).toEqual([
            'Конвейер (nightly) msk.bitrix24.ru: локально 03:45 Europe/Moscow → ai-analytics:snapshot:nightly:msk.bitrix24.ru:2026-09-08',
        ]);
        log.mockRestore();
    });

    it('ночной тик запускает догон истории; недельный и месячный — нет', async () => {
        const nightly = makeScheduler(ENABLED);
        nightly.backfill.dispatch.mockResolvedValue([
            'ai-analytics:snapshot:backfill:a.bitrix24.ru:2026-08',
        ]);
        const weekly = makeScheduler(ENABLED);
        const monthly = makeScheduler(ENABLED);

        const jobIds = await nightly.scheduler.dispatchAll('nightly', NIGHT);
        await weekly.scheduler.dispatchAll('weekly', MONDAY);
        await monthly.scheduler.dispatchAll('monthly', THIRD);

        expect(nightly.backfill.dispatch).toHaveBeenCalledTimes(1);
        expect(nightly.backfill.dispatch).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            { now: NIGHT },
        );
        expect(jobIds).toEqual([
            'ai-analytics:snapshot:nightly:a.bitrix24.ru:2026-09-08',
            'ai-analytics:snapshot:backfill:a.bitrix24.ru:2026-08',
        ]);
        expect(weekly.backfill.dispatch).not.toHaveBeenCalled();
        expect(monthly.backfill.dispatch).not.toHaveBeenCalled();
    });

    it('отказ догона истории не отменяет ночной пересчёт', async () => {
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        const { scheduler, backfill } = makeScheduler(ENABLED);
        backfill.dispatch.mockRejectedValue(new Error('очередь недоступна'));

        const jobIds = await scheduler.dispatchAll('nightly', NIGHT);

        expect(jobIds).toEqual([
            'ai-analytics:snapshot:nightly:a.bitrix24.ru:2026-09-08',
        ]);
        expect(error).toHaveBeenCalledWith(
            expect.stringContaining('очередь недоступна'),
            { telegram: true, domain: 'a.bitrix24.ru' },
        );
        error.mockRestore();
    });
});
