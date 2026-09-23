import { JobNames, QueueNames } from '@lib/queue';
import {
    AI_ANALYTICS_ADMIN_JOB_ID_PREFIX,
    AI_ANALYTICS_ADMIN_JOB_OPTIONS,
} from '../ai-analytics-admin.const';
import {
    AI_ANALYTICS_ADMIN_BACKFILL_MAX_MONTHS,
    AI_ANALYTICS_ADMIN_BACKFILL_REASONS,
    AiAnalyticsPipelineAdminService,
    monthLastDay,
    monthRange,
} from '../services/ai-analytics-pipeline-admin.service';

const DOMAIN = 'april.bitrix24.ru';
const NOW = new Date('2026-09-22T06:00:00.000Z');

/** Аргументы одного вызова dispatch: очередь, имя джобы, payload, jobId, опции. */
type DispatchCall = [string, string, Record<string, unknown>, string, unknown];

function makeService() {
    const dispatch = jest.fn<Promise<unknown>, DispatchCall>();
    dispatch.mockResolvedValue({ id: 'x' });
    const dispatcher = { dispatch };
    return {
        service: new AiAnalyticsPipelineAdminService(dispatcher as never),
        dispatch,
    };
}

describe('monthRange / monthLastDay', () => {
    it('диапазон включает обе границы и идёт по возрастанию', () => {
        expect(monthRange('2026-01', '2026-04')).toEqual([
            '2026-01',
            '2026-02',
            '2026-03',
            '2026-04',
        ]);
        expect(monthRange('2026-12', '2027-02')).toEqual([
            '2026-12',
            '2027-01',
            '2027-02',
        ]);
        expect(monthRange('2026-05', '2026-05')).toEqual(['2026-05']);
    });

    it('перевёрнутый или битый диапазон — пусто', () => {
        expect(monthRange('2026-05', '2026-04')).toEqual([]);
        expect(monthRange('2026-13', '2026-14')).toEqual([]);
        expect(monthRange('не месяц', '2026-04')).toEqual([]);
    });

    it('последний день месяца: 28/29/30/31 по календарю', () => {
        expect(monthLastDay('2026-01')).toBe('2026-01-31');
        expect(monthLastDay('2026-02')).toBe('2026-02-28');
        // 2028 — високосный.
        expect(monthLastDay('2028-02')).toBe('2028-02-29');
        expect(monthLastDay('2026-04')).toBe('2026-04-30');
    });
});

describe('AiAnalyticsPipelineAdminService.recompute', () => {
    it('ставит одну джобу снапшотов с forceRefresh и меткой момента в jobId', async () => {
        const { service, dispatch } = makeService();
        const result = await service.recompute(
            {
                domain: DOMAIN,
                rhythm: 'monthly',
                monthKey: '2026-08',
            },
            NOW,
        );
        expect(dispatch).toHaveBeenCalledTimes(1);
        const [queue, jobName, data, jobId, options] = dispatch.mock.calls[0];
        expect(queue).toBe(QueueNames.SALES_KPI_REPORT);
        expect(jobName).toBe(JobNames.SALES_AI_ANALYTICS_SNAPSHOT);
        expect(data).toEqual({
            domain: DOMAIN,
            kind: 'monthly',
            monthKey: '2026-08',
            forceRefresh: true,
        });
        expect(jobId).toBe(
            `${AI_ANALYTICS_ADMIN_JOB_ID_PREFIX}:monthly:${DOMAIN}:2026-08:recompute:${NOW.getTime()}`,
        );
        expect(options).toBe(AI_ANALYTICS_ADMIN_JOB_OPTIONS);
        expect(result).toEqual({
            domain: DOMAIN,
            forceRefresh: true,
            job: {
                jobId,
                key: `2026-08:recompute:${NOW.getTime()}`,
                rhythm: 'monthly',
            },
        });
    });

    it('ключ ритма: weekly — по неделе, nightly — по дню, иначе месяц', async () => {
        const { service, dispatch } = makeService();
        await service.recompute(
            {
                domain: DOMAIN,
                rhythm: 'weekly',
                monthKey: '2026-08',
                weekKey: '2026-W35',
            },
            NOW,
        );
        await service.recompute(
            {
                domain: DOMAIN,
                rhythm: 'nightly',
                monthKey: '2026-08',
                day: '2026-08-31',
            },
            NOW,
        );
        const jobIds = dispatch.mock.calls.map(call => call[3]);
        expect(jobIds[0]).toContain(':weekly:');
        expect(jobIds[0]).toContain('2026-W35:recompute:');
        expect(jobIds[1]).toContain(':nightly:');
        expect(jobIds[1]).toContain('2026-08-31:recompute:');
    });

    it('шаги и ключи периода едут в payload как есть', async () => {
        const { service, dispatch } = makeService();
        await service.recompute(
            {
                domain: DOMAIN,
                rhythm: 'nightly',
                monthKey: '2026-09',
                day: '2026-09-21',
                weekKey: '2026-W38',
                steps: ['calls', 'kpi'],
            },
            NOW,
        );
        expect(dispatch.mock.calls[0][2]).toEqual({
            domain: DOMAIN,
            kind: 'nightly',
            monthKey: '2026-09',
            day: '2026-09-21',
            weekKey: '2026-W38',
            steps: ['calls', 'kpi'],
            forceRefresh: true,
        });
    });

    it('два вызова подряд дают РАЗНЫЕ jobId — повтор не проглатывается очередью', async () => {
        const { service } = makeService();
        const first = await service.recompute(
            { domain: DOMAIN, rhythm: 'monthly', monthKey: '2026-08' },
            new Date('2026-09-22T06:00:00.000Z'),
        );
        const second = await service.recompute(
            { domain: DOMAIN, rhythm: 'monthly', monthKey: '2026-08' },
            new Date('2026-09-22T06:00:01.000Z'),
        );
        expect(first.job.jobId).not.toBe(second.job.jobId);
    });
});

describe('AiAnalyticsPipelineAdminService.backfill', () => {
    it('ставит по джобе ритма backfill на каждый месяц диапазона', async () => {
        const { service, dispatch } = makeService();
        const result = await service.backfill({
            domain: DOMAIN,
            from: '2026-01',
            to: '2026-03',
        });
        expect(result.monthKeys).toEqual(['2026-01', '2026-02', '2026-03']);
        expect(result.reason).toBeNull();
        expect(dispatch).toHaveBeenCalledTimes(3);
        expect(result.jobs).toHaveLength(3);
        expect(result.jobs[0]).toEqual({
            jobId: `${AI_ANALYTICS_ADMIN_JOB_ID_PREFIX}:backfill:${DOMAIN}:2026-01`,
            key: '2026-01',
            rhythm: 'backfill',
        });
        // День прогона — последний день месяца; forceRefresh не ставится.
        expect(dispatch.mock.calls[0][2]).toEqual({
            domain: DOMAIN,
            kind: 'backfill',
            monthKey: '2026-01',
            day: '2026-01-31',
        });
    });

    it('jobId детерминирован месяцем: повтор запроса даёт те же id', async () => {
        const { service } = makeService();
        const first = await service.backfill({
            domain: DOMAIN,
            from: '2026-02',
            to: '2026-02',
        });
        const second = await service.backfill({
            domain: DOMAIN,
            from: '2026-02',
            to: '2026-02',
        });
        expect(first.jobs[0].jobId).toBe(second.jobs[0].jobId);
    });

    it('пустой диапазон — отказ без постановки джоб', async () => {
        const { service, dispatch } = makeService();
        const result = await service.backfill({
            domain: DOMAIN,
            from: '2026-05',
            to: '2026-04',
        });
        expect(result.reason).toBe(
            AI_ANALYTICS_ADMIN_BACKFILL_REASONS.emptyRange,
        );
        expect(result.jobs).toEqual([]);
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('диапазон шире предела — отказ без постановки джоб', async () => {
        const { service, dispatch } = makeService();
        // Ровно предел проходит, предел + 1 — нет.
        const okTo = shiftMonth(
            '2026-01',
            AI_ANALYTICS_ADMIN_BACKFILL_MAX_MONTHS - 1,
        );
        const wideTo = shiftMonth(
            '2026-01',
            AI_ANALYTICS_ADMIN_BACKFILL_MAX_MONTHS,
        );

        const ok = await service.backfill({
            domain: DOMAIN,
            from: '2026-01',
            to: okTo,
        });
        expect(ok.reason).toBeNull();
        expect(ok.jobs).toHaveLength(AI_ANALYTICS_ADMIN_BACKFILL_MAX_MONTHS);

        dispatch.mockClear();
        const wide = await service.backfill({
            domain: DOMAIN,
            from: '2026-01',
            to: wideTo,
        });
        expect(wide.reason).toBe(AI_ANALYTICS_ADMIN_BACKFILL_REASONS.tooWide);
        expect(wide.jobs).toEqual([]);
        expect(dispatch).not.toHaveBeenCalled();
    });
});

/** Месяц 'YYYY-MM' + N месяцев (вспомогательная формула ожиданий). */
function shiftMonth(monthKey: string, months: number): string {
    const [year, month] = monthKey.split('-').map(Number);
    const total = year * 12 + month - 1 + months;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}
