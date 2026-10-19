import { CALL_REPORT_PROMPT_VERSION } from '../contracts/call-report-versions.const';
import { CallReportReanalysisReportService } from '../services/call-report-reanalysis-report.service';

/**
 * Записи ais переразбора: статус читается активной записью ключа и
 * обновляется в месте; отчёт согласия версий пишется конвертом, прежний
 * того же ключа — superseded; без пар отчёт не пишется.
 */
const DOMAIN = 'gsr.bitrix24.ru';
const NOW = new Date('2026-10-20T01:00:00Z');

const status = (over: Record<string, unknown> = {}) => ({
    domain: DOMAIN,
    from: '2026-09-01',
    to: '2026-09-30',
    userIds: [317],
    dryRun: false,
    promptVersion: CALL_REPORT_PROMPT_VERSION,
    series: '2026-09-25',
    part: 1,
    candidates: 2,
    done: 1,
    failed: 0,
    skipped: 3,
    skippedBy: { upToDate: 3, noAnalysis: 0, notInRoster: 0, noActive: 0 },
    tokens: 1200,
    price: 1.8,
    startedAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    finished: false,
    lastError: null,
    timeBudgetHit: false,
    continuedWith: null,
    estimate: null,
    ...over,
});

function makeService(records: Record<string, unknown>[] = []) {
    const created: Record<string, unknown>[] = [];
    const aiService = {
        findByDomainTypeKeys: jest.fn().mockResolvedValue(records),
        findByDomainTypesInPeriod: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((dto: Record<string, unknown>) => {
            created.push(dto);
            return Promise.resolve({ id: String(100 + created.length) });
        }),
        update: jest.fn().mockResolvedValue({}),
    };
    return {
        service: new CallReportReanalysisReportService(aiService as never),
        aiService,
        created,
    };
}

describe('CallReportReanalysisReportService', () => {
    it('loadStatus берёт активную запись ключа и отбрасывает чужую форму', async () => {
        const { service, aiService } = makeService([
            { id: '1', status: 'superseded', user_result: status({ done: 0 }) },
            { id: '2', status: 'done', user_result: status({ done: 7 }) },
        ]);
        const loaded = await service.loadStatus(
            DOMAIN,
            '2026-09-01',
            '2026-09-30',
        );
        expect(loaded).toMatchObject({ id: '2', status: { done: 7 } });
        expect(aiService.findByDomainTypeKeys).toHaveBeenCalledWith(
            DOMAIN,
            'call-report-reanalysis-run',
            { activityIds: ['2026-09-01..2026-09-30'] },
        );

        const alien = makeService([
            { id: '3', status: 'done', user_result: { что: 'угодно' } },
        ]);
        await expect(
            alien.service.loadStatus(DOMAIN, '2026-09-01', '2026-09-30'),
        ).resolves.toBeNull();
    });

    it('saveStatus создаёт запись ключа, а при существующей — обновляет в месте', async () => {
        const { service, aiService, created } = makeService();
        const id = await service.saveStatus(status(), null);
        expect(id).toBe('101');
        expect(created[0]).toMatchObject({
            type: 'call-report-reanalysis-run',
            provider: 'call-report-reanalyzer',
            activity_id: '2026-09-01..2026-09-30',
            domain: DOMAIN,
            status: 'done',
        });

        await expect(
            service.saveStatus(status({ done: 2 }), '101'),
        ).resolves.toBe('101');
        const [updatedId, patch] = aiService.update.mock.calls[0] as [
            string,
            { user_result: { done: number } },
        ];
        expect(updatedId).toBe('101');
        expect(patch.user_result.done).toBe(2);
    });

    it('writeAgreementReports: пара старая superseded + новая с reanalysisOf → отчёт по серии, прежний отчёт ключа — superseded', async () => {
        const analysis = (
            score: number,
            prompt?: string,
            reanalysisOf?: string,
        ) => ({
            callType: 'presentation',
            weightedScore: score,
            sections: [{ section: 'NEEDS', relevance: 100, score: 7 }],
            ...(prompt ? { versions: { prompt } } : {}),
            ...(reanalysisOf ? { reanalysisOf } : {}),
        });
        const { service, aiService, created } = makeService();
        aiService.findByDomainTypeKeys
            // loadAnalyses
            .mockResolvedValueOnce([
                {
                    id: '1',
                    type: 'agent-analysis',
                    status: 'superseded',
                    transcription_id: 't-1',
                    user_result: analysis(70, 'focus-v2.2-2026-09-08'),
                },
                {
                    id: '9',
                    type: 'agent-analysis',
                    status: 'done',
                    transcription_id: 't-1',
                    user_result: analysis(60, CALL_REPORT_PROMPT_VERSION, '1'),
                },
            ])
            // прежние отчёты ключа
            .mockResolvedValueOnce([
                { id: '55', status: 'done' },
                { id: '50', status: 'superseded' },
            ]);
        const versions = {
            prompt: CALL_REPORT_PROMPT_VERSION,
            rubric: 'r',
            registry: 'x',
            attribution: 'a',
            classifier: 'c',
        };

        const ids = await service.writeAgreementReports(
            DOMAIN,
            ['t-1'],
            versions,
            NOW,
        );

        expect(ids).toEqual(['101']);
        expect(aiService.update).toHaveBeenCalledTimes(1);
        expect(aiService.update).toHaveBeenCalledWith('55', {
            status: 'superseded',
        });
        const key = `2026-09-08->${CALL_REPORT_PROMPT_VERSION}`;
        expect(created[0]).toMatchObject({
            type: 'ai-analytics-version-agreement',
            provider: 'ai-analytics',
            activity_id: key,
            domain: DOMAIN,
            user_result: {
                managerId: null,
                paramsVersion: CALL_REPORT_PROMPT_VERSION,
                generatedAt: NOW.toISOString(),
                payload: {
                    key,
                    fromSeries: '2026-09-08',
                    pairs: 1,
                    byOldPromptVersion: [
                        {
                            promptVersion: 'focus-v2.2-2026-09-08',
                            pairs: 1,
                            meanShift: -1,
                        },
                    ],
                },
            },
        });
    });

    it('без пар отчёт не пишется', async () => {
        const { service, created } = makeService([]);
        await expect(
            service.writeAgreementReports(
                DOMAIN,
                [],
                {
                    prompt: 'p',
                    rubric: 'r',
                    registry: 'x',
                    attribution: 'a',
                    classifier: 'c',
                },
                NOW,
            ),
        ).resolves.toEqual([]);
        expect(created).toHaveLength(0);
    });
});
