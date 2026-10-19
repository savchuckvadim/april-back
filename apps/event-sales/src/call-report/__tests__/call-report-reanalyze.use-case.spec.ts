import { CALL_REPORT_PROMPT_VERSION } from '../contracts/call-report-versions.const';
import {
    containing,
    liteRow,
    makeUseCase,
    NOW,
    OLD_VERSION,
    oldRecord,
    PERIOD,
    SAME_SERIES_VERSION,
} from './call-report-reanalyze.fixture';

/**
 * Переразбор истории, запись: кандидаты по сериям версий и пилоту, новая
 * запись agent-analysis с копией ссылок + superseded старой, статус в
 * ais, отчёт согласия версий по сериям; dryRun без модели. Продолжения,
 * бюджет времени и сбои — call-report-reanalyze.use-case.flow.spec.ts.
 */
describe('CallReportReanalyzeUseCase: запись переразбора', () => {
    it('переразбирает только чужую серию и разборы без версий у пилота; новая запись копирует ссылки, старая — superseded; отчёт согласия по сериям', async () => {
        const { useCase, db, ofType, rerunService } = makeUseCase({
            rows: [
                liteRow('t-1', '317'),
                liteRow('t-2', '317'),
                liteRow('t-3', '317'),
                liteRow('t-4', '999'),
                liteRow('t-5', '317'),
            ],
            records: [
                oldRecord('1', 't-1', OLD_VERSION),
                oldRecord('2', 't-2', SAME_SERIES_VERSION),
                oldRecord('4', 't-4', OLD_VERSION),
                oldRecord('5', 't-5', null),
            ],
        });

        const result = await useCase.execute(PERIOD, NOW);

        expect(rerunService.rerun).toHaveBeenCalledTimes(2);
        expect(rerunService.rerun).toHaveBeenCalledWith({
            transcriptionId: 't-1',
            source: containing({ weightedScore: 70 }),
            model: 'gpt-x',
        });
        const fresh = ofType('agent-analysis').filter(
            record =>
                record.status === 'done' &&
                record.provider === 'call-report-reanalyzer',
        );
        expect(fresh).toHaveLength(2);
        expect(fresh[0]).toMatchObject({
            transcription_id: 't-1',
            app: 'call-report',
            model: 'gpt-x',
            report_item_id: '500',
            in_report: true,
            activity_id: 'a-old',
            entity_type: 'deal',
            entity_id: 5,
            user_id: 317,
            tokens_count: 1200,
            price: 1.8,
            user_result: containing({
                reanalysisOf: '1',
                agentName: 'call-report-reanalyzer',
                versions: containing({ prompt: CALL_REPORT_PROMPT_VERSION }),
            }),
        });
        expect(db.find(record => record.id === '1')?.status).toBe('superseded');
        expect(db.find(record => record.id === '5')?.status).toBe('superseded');
        expect(db.find(record => record.id === '2')?.status).toBe('done');

        expect(result).toMatchObject({
            candidates: 2,
            processed: 2,
            done: 2,
            failed: 0,
            skipped: 3,
            continuedWith: null,
            tokens: 2400,
            price: 3.6,
        });
        const status = ofType('call-report-reanalysis-run');
        expect(status).toHaveLength(1);
        expect(status[0]).toMatchObject({
            activity_id: '2026-09-01..2026-09-30',
            user_result: containing({
                finished: true,
                done: 2,
                skippedBy: {
                    upToDate: 1,
                    noAnalysis: 1,
                    notInRoster: 1,
                    noActive: 0,
                },
                userIds: [317],
            }),
        });
        // Отчёт согласия: серия v2.2 и «без версий» — по ключу на серию.
        const reports = ofType('ai-analytics-version-agreement');
        expect(reports.map(record => record.activity_id).sort()).toEqual([
            `2026-09-08->${CALL_REPORT_PROMPT_VERSION}`,
            `none->${CALL_REPORT_PROMPT_VERSION}`,
        ]);
        expect(result.reportIds).toHaveLength(2);
    });

    it('явный userIds перекрывает пилот из настроек', async () => {
        const { useCase, rerunService, rerunCall } = makeUseCase({
            rows: [liteRow('t-1', '317'), liteRow('t-4', '999')],
            records: [
                oldRecord('1', 't-1', OLD_VERSION),
                oldRecord('4', 't-4', OLD_VERSION),
            ],
        });
        await useCase.execute({ ...PERIOD, userIds: [999] }, NOW);
        expect(rerunService.rerun).toHaveBeenCalledTimes(1);
        expect(rerunCall(0).transcriptionId).toBe('t-4');
    });

    it('dryRun: модель не зовётся, записи разборов не создаются, в статусе кандидаты и оценка стоимости', async () => {
        const { useCase, rerunService, ofType, aiService } = makeUseCase({
            rows: [liteRow('t-1', '317'), liteRow('t-5', '317')],
            records: [
                oldRecord('1', 't-1', OLD_VERSION),
                oldRecord('5', 't-5', null),
            ],
            recent: [
                { tokens_count: 1000, price: 1.5 },
                { tokens_count: 3000, price: 4.5 },
            ],
        });
        const result = await useCase.execute({ ...PERIOD, dryRun: true }, NOW);

        expect(rerunService.rerun).not.toHaveBeenCalled();
        expect(aiService.update).not.toHaveBeenCalled();
        expect(ofType('agent-analysis')).toHaveLength(2);
        expect(result).toMatchObject({
            dryRun: true,
            candidates: 2,
            done: 0,
            processed: 0,
        });
        expect(
            ofType('call-report-reanalysis-run')[0].user_result,
        ).toMatchObject({
            dryRun: true,
            finished: true,
            candidates: 2,
            estimate: {
                basedOnRecords: 2,
                avgTokens: 2000,
                estimatedTokens: 4000,
                estimatedPrice: 6,
            },
        });

        const noUsage = makeUseCase({
            rows: [liteRow('t-1', '317')],
            records: [oldRecord('1', 't-1', OLD_VERSION)],
        });
        await noUsage.useCase.execute({ ...PERIOD, dryRun: true }, NOW);
        const estimate = (
            noUsage.ofType('call-report-reanalysis-run')[0].user_result as {
                estimate: { avgTokens: null; message: string };
            }
        ).estimate;
        expect(estimate.avgTokens).toBeNull();
        expect(estimate.message).toContain('Оценки нет');
    });
});
