import type { ReanalysisRunStatus } from '../../../contracts/reanalysis.types';
import { backtest } from '../../launch/__tests__/launch-status.fixture';
import type { AiAnalyticsLaunchStageFlagsService } from '../../launch/services/ai-analytics-launch-stage-flags.service';
import type { AiAnalyticsEtlStatusService } from '../../services/ai-analytics-etl-status.service';
import type { AiAnalyticsPhase4StatusService } from '../../services/ai-analytics-phase4-status.service';
import type { AiAnalyticsPipelineAdminService } from '../../services/ai-analytics-pipeline-admin.service';
import type { AiAnalyticsReanalyzeService } from '../../services/ai-analytics-reanalyze.service';
import type { AiOwnerReportExportService } from '../../services/ai-owner-report-export.service';
import { applyOutcome, newScenario } from '../refresh.plan';
import type { AiRefreshStepOutcome } from '../refresh.types';
import { AiRefreshForecastStep } from '../steps/forecast.step';
import { AiRefreshOwnerReportStep } from '../steps/owner-report.step';
import { AiRefreshReanalyzeStep } from '../steps/reanalyze.step';
import { AiRefreshRebuildStep } from '../steps/rebuild.step';
import type { AiRefreshStepContext } from '../steps/refresh-step.types';

const NOW = new Date('2026-11-08T15:00:00.000Z');
const at = (minutes: number): Date =>
    new Date(NOW.getTime() + minutes * 60_000);

/** Контекст шага `code` после исхода `outcome` в момент NOW. */
const contextAfter = (
    code: AiRefreshStepContext['step']['code'],
    outcome: AiRefreshStepOutcome,
    now: Date,
): AiRefreshStepContext => {
    const scenario = applyOutcome(
        newScenario(
            {
                id: 's1',
                domain: 'gsr.bitrix24.ru',
                monthKey: '2026-10',
                withReanalysis: true,
                requestedBy: null,
            },
            NOW,
        ),
        code,
        outcome,
        NOW,
    );
    const step = scenario.steps.find(item => item.code === code);
    if (!step) throw new Error(code);
    return { scenario, step, now };
};

const runStatus = (over: Partial<ReanalysisRunStatus>): ReanalysisRunStatus =>
    ({
        domain: 'gsr.bitrix24.ru',
        from: '2026-10-01',
        to: '2026-10-31',
        dryRun: false,
        part: 1,
        candidates: 100,
        done: 0,
        failed: 0,
        price: 0,
        updatedAt: at(5).toISOString(),
        finished: false,
        lastError: null,
        estimate: null,
        ...over,
    }) as ReanalysisRunStatus;

describe('шаг «переразбор»', () => {
    const make = (runs: (ReanalysisRunStatus | null)[]) => {
        const status = jest.fn();
        for (const run of runs) status.mockResolvedValueOnce({ run });
        const run = jest
            .fn()
            .mockResolvedValue({ dispatched: true, reason: null });
        const step = new AiRefreshReanalyzeStep({
            status,
            run,
        } as unknown as AiAnalyticsReanalyzeService);
        return { step, run };
    };

    it('старт — бесплатный подсчёт; подсчёт готов — запуск; конец — итог словами', async () => {
        const { step, run } = make([
            null,
            runStatus({ dryRun: true, finished: true, candidates: 159 }),
            runStatus({
                finished: true,
                candidates: 159,
                done: 158,
                failed: 1,
                price: 12.4,
            }),
        ]);
        const counting = contextAfter(
            'reanalyze',
            { state: 'running', text: '' },
            NOW,
        );
        expect(await step.start(counting)).toMatchObject({
            state: 'running',
            phase: 'count',
        });
        expect(run).toHaveBeenLastCalledWith(
            expect.objectContaining({
                dryRun: true,
                from: '2026-10-01',
                to: '2026-10-31',
            }),
        );

        const counted = contextAfter(
            'reanalyze',
            { state: 'running', phase: 'count', text: '' },
            at(6),
        );
        const afterCount = await step.probe(counted);
        expect(afterCount).toMatchObject({ state: 'running', phase: 'run' });
        expect(afterCount.text).toContain('159 звонков');
        expect(run).toHaveBeenLastCalledWith(
            expect.objectContaining({ dryRun: false }),
        );

        const running = contextAfter(
            'reanalyze',
            { state: 'running', phase: 'run', text: '' },
            at(6),
        );
        expect(await step.probe(running)).toEqual({
            state: 'done',
            text: 'Переразобрано 158, сбоев 1, потрачено ≈ 12 ₽.',
        });
    });

    it('нечего переразбирать — пропуск; больше потолка — стоп без запуска; идущий — подхватывается', async () => {
        const counted = contextAfter(
            'reanalyze',
            { state: 'running', phase: 'count', text: '' },
            at(6),
        );
        const empty = make([
            runStatus({ dryRun: true, finished: true, candidates: 0 }),
        ]);
        expect((await empty.step.probe(counted)).state).toBe('skipped');

        const huge = make([
            runStatus({ dryRun: true, finished: true, candidates: 5000 }),
        ]);
        expect((await huge.step.probe(counted)).state).toBe('error');
        expect(huge.run).not.toHaveBeenCalled();

        const busy = make([runStatus({ finished: false })]);
        expect(
            await busy.step.start(
                contextAfter('reanalyze', { state: 'running', text: '' }, NOW),
            ),
        ).toMatchObject({ state: 'running', phase: 'run' });
        expect(busy.run).not.toHaveBeenCalled();
    });

    it('переразбор больше часа без движения — встал', async () => {
        const { step } = make([runStatus({ updatedAt: at(1).toISOString() })]);
        const running = contextAfter(
            'reanalyze',
            { state: 'running', phase: 'run', text: '' },
            at(90),
        );
        expect((await step.probe(running)).state).toBe('error');
    });
});

describe('шаг «пересчёт месяца»', () => {
    it('ставит догон месяца с force; готов по свежему журналу backfill этого месяца', async () => {
        const backfill = jest
            .fn()
            .mockResolvedValue({ jobs: [{}], reason: null });
        const status = jest
            .fn()
            .mockResolvedValueOnce({
                runs: [
                    // Старый журнал до старта — не считается.
                    {
                        rhythm: 'backfill',
                        day: '2026-10-31',
                        status: 'ok',
                        generatedAt: at(-60).toISOString(),
                        failed: [],
                        skipped: [],
                    },
                ],
            })
            .mockResolvedValueOnce({
                runs: [
                    {
                        rhythm: 'nightly',
                        day: '2026-11-08',
                        status: 'ok',
                        generatedAt: at(20).toISOString(),
                        failed: [],
                        skipped: [],
                    },
                    {
                        rhythm: 'backfill',
                        day: '2026-10-31',
                        status: 'partial',
                        generatedAt: at(20).toISOString(),
                        failed: [],
                        skipped: ['quality-link'],
                    },
                ],
            });
        const step = new AiRefreshRebuildStep(
            { backfill } as unknown as AiAnalyticsPipelineAdminService,
            { status } as unknown as AiAnalyticsEtlStatusService,
        );
        const ctx = contextAfter(
            'rebuild',
            { state: 'running', text: '' },
            at(10),
        );
        expect((await step.start(ctx)).state).toBe('running');
        expect(backfill).toHaveBeenCalledWith(
            {
                domain: 'gsr.bitrix24.ru',
                from: '2026-10',
                to: '2026-10',
                force: true,
            },
            at(10),
        );
        expect((await step.probe(ctx)).state).toBe('running');
        const finished = await step.probe(ctx);
        expect(finished.state).toBe('done');
        expect(finished.text).toContain('quality-link');
    });
});

describe('шаг «прогноз»', () => {
    const make = (view: ReturnType<typeof backtest> | null) => {
        const apply = jest
            .fn()
            .mockResolvedValue({ message: 'Прогноз включён.' });
        const step = new AiRefreshForecastStep(
            {
                forecastBacktest: jest
                    .fn()
                    .mockResolvedValue({ items: view ? [view] : [] }),
            } as unknown as AiAnalyticsPhase4StatusService,
            { apply } as unknown as AiAnalyticsLaunchStageFlagsService,
        );
        return { step, apply };
    };
    const ctx = contextAfter('forecast', { state: 'running', text: '' }, NOW);

    it('пройдена — показ включается без force', async () => {
        const { step, apply } = make(backtest());
        expect((await step.start(ctx)).state).toBe('done');
        expect(apply).toHaveBeenCalledWith({
            domain: 'gsr.bitrix24.ru',
            forecast: true,
        });
    });

    it('не пройдена или нет проверки — пропуск с вердиктом, показ не трогается', async () => {
        const failed = make(
            backtest({ status: 'fail', reasons: ['coverage-below'] }),
        );
        const skipped = await failed.step.start(ctx);
        expect(skipped.state).toBe('skipped');
        expect(skipped.text).toContain('Прогноз пока не показываем');
        expect(failed.apply).not.toHaveBeenCalled();
        expect((await make(null).step.start(ctx)).state).toBe('skipped');
    });
});

describe('шаг «PDF собственнику»', () => {
    it('ставит выгрузку заново; готов / ошибка / пропало — по состоянию в Redis', async () => {
        const start = jest.fn().mockResolvedValue({ status: 'queued' });
        const state = jest
            .fn()
            .mockResolvedValueOnce({ status: 'processing' })
            .mockResolvedValueOnce({ status: 'ready', sizeBytes: 88_064 })
            .mockResolvedValueOnce({ status: 'error', message: 'нет данных' })
            .mockResolvedValueOnce(null);
        const step = new AiRefreshOwnerReportStep({
            start,
            state,
        } as unknown as AiOwnerReportExportService);
        const ctx = contextAfter(
            'owner-report',
            { state: 'running', text: '' },
            NOW,
        );
        expect((await step.start(ctx)).state).toBe('running');
        expect(start).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: 'month',
                periodKey: '2026-10',
                forceRefresh: true,
            }),
            NOW,
        );
        expect((await step.probe(ctx)).state).toBe('running');
        const ready = await step.probe(ctx);
        expect(ready.state).toBe('done');
        expect(ready.text).toContain('86 КБ');
        expect((await step.probe(ctx)).state).toBe('error');
        expect((await step.probe(ctx)).state).toBe('error');
    });
});
