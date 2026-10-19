import { REANALYSIS_DEFAULTS } from '@lib/sales-ai-analytics';
import { CALL_REPORT_PROMPT_VERSION } from '../contracts/call-report-versions.const';
import {
    containing,
    DOMAIN,
    liteRow,
    makeUseCase,
    NOW,
    OLD_VERSION,
    oldRecord,
    PERIOD,
} from './call-report-reanalyze.fixture';

/**
 * Переразбор истории, ход прогона: квота и бюджет времени ставят
 * продолжение той же нагрузкой (part + 1); сбой модели не роняет часть и
 * не крутит цепочку без успехов; часть 2 несёт счётчики незаконченного
 * прогона и обновляет ту же запись статуса.
 */
const twoCandidates = () => ({
    rows: [liteRow('t-1', '317'), liteRow('t-5', '317')],
    records: [oldRecord('1', 't-1', OLD_VERSION), oldRecord('5', 't-5', null)],
});

describe('CallReportReanalyzeUseCase: продолжения и сбои', () => {
    afterEach(() => jest.restoreAllMocks());

    it('квота исчерпана при оставшихся кандидатах — ставится продолжение той же нагрузкой с part + 1', async () => {
        const { useCase, queueDispatcher, ofType } =
            makeUseCase(twoCandidates());
        const result = await useCase.execute({ ...PERIOD, quota: 1 }, NOW);

        const jobId = `call-report-reanalyze:${DOMAIN}:2026-09-01:2026-09-30:run:part-2`;
        expect(queueDispatcher.dispatch).toHaveBeenCalledWith(
            'call-report',
            'call-report-reanalyze',
            { ...PERIOD, quota: 1, part: 2 },
            jobId,
            containing({ attempts: 1, removeOnComplete: true }),
        );
        expect(result).toMatchObject({
            processed: 1,
            done: 1,
            continuedWith: jobId,
        });
        expect(
            ofType('call-report-reanalysis-run')[0].user_result,
        ).toMatchObject({ finished: false, continuedWith: jobId });
    });

    it('бюджет времени исчерпан после первого звонка — часть останавливается и ставит продолжение', async () => {
        const { useCase, rerunService, queueDispatcher } =
            makeUseCase(twoCandidates());
        jest.spyOn(Date, 'now')
            .mockReturnValueOnce(0)
            .mockReturnValueOnce(0)
            .mockReturnValue(REANALYSIS_DEFAULTS.timeBudgetMs + 1);

        const result = await useCase.execute(PERIOD, NOW);

        expect(rerunService.rerun).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({
            processed: 1,
            done: 1,
            timeBudgetHit: true,
        });
        expect(result.continuedWith).toContain(':part-2');
        expect(queueDispatcher.dispatch).toHaveBeenCalledTimes(1);
    });

    it('сбой модели: старая запись остаётся активной, сбой в счётчике, продолжение без успехов не ставится', async () => {
        const { useCase, db, queueDispatcher, ofType } = makeUseCase({
            ...twoCandidates(),
            rerun: 'throw',
        });
        const result = await useCase.execute({ ...PERIOD, quota: 1 }, NOW);

        expect(db.find(record => record.id === '1')?.status).toBe('done');
        expect(ofType('agent-analysis')).toHaveLength(2);
        expect(result).toMatchObject({
            processed: 1,
            done: 0,
            failed: 1,
            continuedWith: null,
        });
        expect(queueDispatcher.dispatch).not.toHaveBeenCalled();
        expect(
            ofType('call-report-reanalysis-run')[0].user_result,
        ).toMatchObject({ lastError: 'модель упала', finished: true });
    });

    it('часть 2 продолжает счётчики незаконченного прогона и обновляет ту же запись статуса', async () => {
        const previous = {
            id: '77',
            type: 'call-report-reanalysis-run',
            status: 'done',
            activity_id: '2026-09-01..2026-09-30',
            user_result: {
                ...PERIOD,
                userIds: [317],
                dryRun: false,
                promptVersion: CALL_REPORT_PROMPT_VERSION,
                series: '2026-09-25',
                part: 1,
                candidates: 2,
                done: 1,
                failed: 0,
                skipped: 0,
                skippedBy: {
                    upToDate: 0,
                    noAnalysis: 0,
                    notInRoster: 0,
                    noActive: 0,
                },
                tokens: 1200,
                price: 1.8,
                startedAt: '2026-10-20T00:00:00.000Z',
                updatedAt: '2026-10-20T00:30:00.000Z',
                finished: false,
                lastError: null,
                timeBudgetHit: false,
                continuedWith: 'x',
                estimate: null,
            },
        };
        const { useCase, ofType, aiService } = makeUseCase({
            rows: [liteRow('t-5', '317')],
            records: [previous, oldRecord('5', 't-5', null)],
        });
        const result = await useCase.execute({ ...PERIOD, part: 2 }, NOW);

        expect(result).toMatchObject({
            part: 2,
            done: 2,
            tokens: 2400,
            continuedWith: null,
        });
        expect(ofType('call-report-reanalysis-run')).toHaveLength(1);
        expect(aiService.update).toHaveBeenCalledWith(
            '77',
            containing({
                user_result: containing({
                    done: 2,
                    finished: true,
                    startedAt: '2026-10-20T00:00:00.000Z',
                }),
            }),
        );
    });
});
