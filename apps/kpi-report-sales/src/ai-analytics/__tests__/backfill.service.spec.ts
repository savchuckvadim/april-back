import 'reflect-metadata';
import { DEFAULT_WORK_CALENDAR } from '@lib/sales-ai-analytics';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import {
    AI_PIPELINE_BACKFILL,
    AI_PIPELINE_JOB_OPTIONS,
    buildPipelineJobId,
} from '../constants/ai-snapshot.const';
import {
    AI_BACKFILL_REASONS,
    AiAnalyticsBackfillService,
    isBackfillWindow,
    monthLastDay,
    portalHour,
} from '../pipeline/backfill.service';

const DOMAIN = 'a.bitrix24.ru';
/** 8 сентября 2026, 20:00 UTC = 23:00 МСК — ночное окно портала. */
const NIGHT = new Date('2026-09-08T20:00:00Z');
/** 8 сентября 2026, 09:00 UTC = 12:00 МСК — рабочий день, окно закрыто. */
const NOON = new Date('2026-09-08T09:00:00Z');

/** Стор снапшотов: периоды, по которым снапшоты уже есть. */
function makeStore(existing: readonly string[] = []) {
    const findByKeys = jest.fn(
        (
            _domain: string,
            _type: string,
            filter: { periodKeys?: readonly string[] },
        ) =>
            Promise.resolve(
                (filter.periodKeys ?? [])
                    .filter(key => existing.includes(key))
                    .map(periodKey => ({ periodKey })),
            ),
    );
    return { findByKeys };
}

function makeService(existing: readonly string[] = [], enabled = true) {
    const settings = {
        load: jest.fn().mockResolvedValue({
            enabled,
            calendar: DEFAULT_WORK_CALENDAR,
        }),
    };
    const store = makeStore(existing);
    const dispatcher = { dispatch: jest.fn().mockResolvedValue(undefined) };
    const service = new AiAnalyticsBackfillService(
        settings as never,
        store as never,
        dispatcher as never,
    );
    return { service, store, dispatcher, settings };
}

describe('backfill — ночное окно портала', () => {
    it('час считается в TZ портала, а не в UTC', () => {
        expect(portalHour(NIGHT, 'Europe/Moscow')).toBe(23);
        expect(portalHour(NOON, 'Europe/Moscow')).toBe(12);
    });

    it('окно открыто с 22:00 до 06:00 включительно по краям', () => {
        const at = (hour: string): Date =>
            new Date(`2026-09-08T${hour}:00:00+03:00`);

        expect(isBackfillWindow(at('22'), 'Europe/Moscow')).toBe(true);
        expect(isBackfillWindow(at('05'), 'Europe/Moscow')).toBe(true);
        expect(isBackfillWindow(at('06'), 'Europe/Moscow')).toBe(false);
        expect(isBackfillWindow(at('21'), 'Europe/Moscow')).toBe(false);
    });

    it('последний день месяца — день прогона джобы месяца', () => {
        expect(monthLastDay('2026-02')).toBe('2026-02-28');
        expect(monthLastDay('2026-07')).toBe('2026-07-31');
        expect(monthLastDay('2026-12')).toBe('2026-12-31');
    });
});

describe('AiAnalyticsBackfillService.plan — план догона истории', () => {
    it('вне окна план пуст с причиной и снапшоты не читаются', async () => {
        const { service, store } = makeService();

        const plan = await service.plan(DOMAIN, { now: NOON });

        expect(plan).toEqual({
            monthKeys: [],
            weekKeys: [],
            reason: AI_BACKFILL_REASONS.windowClosed,
        });
        expect(store.findByKeys).not.toHaveBeenCalled();
    });

    it('за ночь берётся не больше трёх месяцев, недели режутся лимитом', async () => {
        const { service } = makeService();

        const plan = await service.plan(DOMAIN, { now: NIGHT });

        expect(plan.monthKeys).toEqual(['2026-08', '2026-07', '2026-06']);
        expect(plan.monthKeys.length).toBe(
            AI_PIPELINE_BACKFILL.maxMonthsPerNight,
        );
        expect(plan.weekKeys.length).toBe(AI_PIPELINE_BACKFILL.weekLimit);
        expect(plan.weekKeys[0]).toBe('2026-W36');
        expect(plan.reason).toBeUndefined();
    });

    it('посчитанные периоды не пересчитываются', async () => {
        const { service } = makeService(['2026-08', '2026-07', '2026-W36']);

        const plan = await service.plan(DOMAIN, { now: NIGHT });

        expect(plan.monthKeys).toEqual(['2026-06', '2026-05', '2026-04']);
        expect(plan.weekKeys).not.toContain('2026-W36');
        expect(plan.weekKeys[0]).toBe('2026-W35');
    });

    it('forceRefresh пересчитывает даже посчитанные периоды', async () => {
        const { service, store } = makeService(['2026-08', '2026-07']);

        const plan = await service.plan(DOMAIN, {
            now: NIGHT,
            forceRefresh: true,
        });

        expect(plan.monthKeys).toEqual(['2026-08', '2026-07', '2026-06']);
        expect(store.findByKeys).not.toHaveBeenCalled();
    });

    it('дыр нет — план пуст с причиной', async () => {
        const months = ['2026-08', '2026-07', '2026-06'];
        const weeks = Array.from(
            { length: 13 },
            (_, index) => `2026-W${36 - index}`,
        );
        const { service } = makeService([...months, ...weeks]);

        const plan = await service.plan(DOMAIN, {
            now: NIGHT,
            monthsBack: 3,
            weeksBack: 13,
        });

        expect(plan).toEqual({
            monthKeys: [],
            weekKeys: [],
            reason: AI_BACKFILL_REASONS.nothingToDo,
        });
    });

    it('портал с выключенной AI-аналитикой не догоняется', async () => {
        const { service } = makeService([], false);

        const plan = await service.plan(DOMAIN, { now: NIGHT });

        expect(plan.reason).toBe(AI_BACKFILL_REASONS.disabled);
    });

    it('ignoreWindow разрешает ручной прогон днём', async () => {
        const { service } = makeService();

        const plan = await service.plan(DOMAIN, {
            now: NOON,
            ignoreWindow: true,
        });

        expect(plan.monthKeys).toEqual(['2026-08', '2026-07', '2026-06']);
    });
});

describe('AiAnalyticsBackfillService.dispatch — постановка джоб', () => {
    it('на каждый период ставится своя джоба с детерминированным jobId', async () => {
        const { service, dispatcher } = makeService();

        const jobIds = await service.dispatch(DOMAIN, {
            now: NIGHT,
            weeksBack: 1,
        });

        expect(jobIds).toContain(
            buildPipelineJobId('backfill', DOMAIN, '2026-08'),
        );
        expect(jobIds).toContain(
            buildPipelineJobId('backfill', DOMAIN, '2026-W36'),
        );
        expect(jobIds).toHaveLength(4);
        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_AI_ANALYTICS_SNAPSHOT,
            expect.objectContaining({
                domain: DOMAIN,
                kind: 'backfill',
                monthKey: '2026-08',
                day: '2026-08-31',
            }),
            buildPipelineJobId('backfill', DOMAIN, '2026-08'),
            AI_PIPELINE_JOB_OPTIONS,
        );
    });

    it('джоба недели несёт ключ недели и её последний день', async () => {
        const { service, dispatcher } = makeService([
            '2026-08',
            '2026-07',
            '2026-06',
            '2026-05',
            '2026-04',
            '2026-03',
            '2026-02',
            '2026-01',
            '2025-12',
            '2025-11',
            '2025-10',
            '2025-09',
        ]);

        await service.dispatch(DOMAIN, { now: NIGHT, weeksBack: 1 });

        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_AI_ANALYTICS_SNAPSHOT,
            expect.objectContaining({
                kind: 'backfill',
                weekKey: '2026-W36',
                day: '2026-09-06',
                monthKey: '2026-09',
            }),
            buildPipelineJobId('backfill', DOMAIN, '2026-W36'),
            AI_PIPELINE_JOB_OPTIONS,
        );
    });

    it('вне окна джобы не ставятся', async () => {
        const { service, dispatcher } = makeService();

        const jobIds = await service.dispatch(DOMAIN, { now: NOON });

        expect(jobIds).toEqual([]);
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('план целиком едет в payload джобы — он виден в журнале прогона', async () => {
        const { service, dispatcher } = makeService();

        await service.dispatch(DOMAIN, { now: NIGHT, weeksBack: 1 });

        const [, , data] = dispatcher.dispatch.mock.calls[0] as [
            string,
            string,
            { backfill: { monthKeys: string[]; weekKeys: string[] } },
        ];
        expect(data.backfill.monthKeys).toEqual([
            '2026-08',
            '2026-07',
            '2026-06',
        ]);
        expect(data.backfill.weekKeys).toEqual(['2026-W36']);
    });
});
