import { CALL_REPORT_PROMPT_VERSION } from '../contracts/call-report-versions.const';
import {
    CallReportRetestUseCase,
    RETEST_DEFAULTS,
} from '../use-cases/call-report-retest.use-case';

/**
 * Test-retest оценщика (Фаза 3, П7): выборка текущей версии промпта в
 * пределах квоты, повтор через фокус-разбор без записи в Битрикс, повторы
 * прошлых запусков переиспользуются, отчёт согласия пишется конвертом
 * снапшота, прежний помечается superseded.
 */
const DOMAIN = 'april.bitrix24.ru';
const NOW = new Date('2026-09-25T10:00:00.000Z');

const analysis = (score: number, callType = 'presentation') => ({
    callType,
    productive: true,
    weightedScore: score,
    sections: [{ section: 'NEEDS', relevance: 100, score: 7 }],
    objections: [{ category: 'price' }],
    versions: { prompt: CALL_REPORT_PROMPT_VERSION },
    summary: 'резюме',
});

const original = (id: string, transcriptionId: string, score = 70) => ({
    id,
    type: 'agent-analysis',
    transcription_id: transcriptionId,
    status: 'done',
    user_result: analysis(score),
});

interface Options {
    originals?: ReturnType<typeof original>[];
    reruns?: { id: string; transcription_id: string; user_result: unknown }[];
    previousReports?: { id: string; status: string }[];
    focusFails?: boolean;
}

function makeUseCase(options: Options = {}) {
    const created: Record<string, unknown>[] = [];
    const aiService = {
        findByDomainTypesInPeriod: jest
            .fn()
            .mockResolvedValue(options.originals ?? []),
        findByTranscriptionIds: jest.fn().mockResolvedValue(
            (options.reruns ?? []).map(record => ({
                ...record,
                type: 'agent-analysis-retest',
            })),
        ),
        findByDomainTypeKeys: jest
            .fn()
            .mockResolvedValue(options.previousReports ?? []),
        create: jest.fn().mockImplementation((dto: Record<string, unknown>) => {
            created.push(dto);
            return Promise.resolve({ id: String(created.length) });
        }),
        update: jest.fn().mockResolvedValue({}),
    };
    const transcriptionStore = {
        findPipelineById: jest.fn().mockImplementation((id: string) =>
            Promise.resolve({
                id,
                domain: DOMAIN,
                text: 'расшифровка',
                segments: [
                    {
                        startSec: 0,
                        endSec: 3,
                        speaker: 'unknown',
                        text: 'Алло',
                    },
                ],
                activityId: 'a-1',
                entityType: 'deal',
                entityId: '5',
            }),
        ),
    };
    const focusAnalysis = {
        run: jest
            .fn()
            .mockImplementation(() =>
                Promise.resolve(options.focusFails ? null : analysis(60)),
            ),
    };
    const contextBuilder = {
        build: jest.fn().mockResolvedValue({ certainty: 'high' }),
        renderForPrompt: jest.fn().mockReturnValue('ПАСПОРТ'),
    };
    const settingsService = {
        resolve: jest.fn().mockResolvedValue({ deepAnalysisModel: 'gpt-x' }),
    };
    const callTypeRegistry = {
        resolve: jest
            .fn()
            .mockResolvedValue({ codes: ['cold', 'presentation'] }),
    };
    const useCase = new CallReportRetestUseCase(
        aiService as never,
        transcriptionStore as never,
        focusAnalysis as never,
        contextBuilder as never,
        settingsService as never,
        callTypeRegistry as never,
    );

    return { useCase, aiService, focusAnalysis, transcriptionStore, created };
}

describe('CallReportRetestUseCase', () => {
    it('повторяет выборку тем же фокус-разбором с таймкодами и паспортом, пишет отчёт', async () => {
        const { useCase, focusAnalysis, aiService, created } = makeUseCase({
            originals: [original('1', 't-1'), original('2', 't-2', 80)],
        });

        const result = await useCase.execute({ domain: DOMAIN }, NOW);

        expect(focusAnalysis.run).toHaveBeenCalledTimes(2);
        expect(focusAnalysis.run).toHaveBeenCalledWith(
            DOMAIN,
            '[00:00] Алло',
            'presentation',
            'ПАСПОРТ',
            { model: 'gpt-x' },
        );
        // Два повтора + отчёт согласия; в Битрикс ничего не пишется.
        expect(created).toHaveLength(3);
        // Выборка идёт свежими первыми (id по убыванию): первым повторён t-2.
        expect(created[0]).toMatchObject({
            type: 'agent-analysis-retest',
            transcription_id: 't-2',
            domain: DOMAIN,
        });
        const report = created[2] as {
            type: string;
            user_result: { payload: { pairs: number; promptVersion: string } };
        };
        expect(report.type).toBe('ai-analytics-golden-report');
        expect(report.user_result.payload.pairs).toBe(2);
        expect(report.user_result.payload.promptVersion).toBe(
            CALL_REPORT_PROMPT_VERSION,
        );
        expect(result).toMatchObject({
            candidates: 2,
            sampled: 2,
            rerun: 2,
            reused: 0,
            pairs: 2,
            reportId: '3',
            timeBudgetHit: false,
        });
        expect(aiService.update).not.toHaveBeenCalled();
    });

    it('квота режет выборку, чужая версия промпта не берётся, повторы прошлых запусков переиспользуются', async () => {
        const stale = {
            ...original('3', 't-3'),
            user_result: { ...analysis(70), versions: { prompt: 'старый' } },
        };
        const { useCase, focusAnalysis } = makeUseCase({
            originals: [original('1', 't-1'), original('2', 't-2'), stale],
            reruns: [
                { id: '9', transcription_id: 't-2', user_result: analysis(65) },
            ],
        });

        const result = await useCase.execute({ domain: DOMAIN, quota: 2 }, NOW);

        expect(result.candidates).toBe(2);
        expect(result.sampled).toBe(2);
        // t-2 взят из прошлого запуска, повторён только t-1.
        expect(focusAnalysis.run).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({ rerun: 1, reused: 1, pairs: 2 });
    });

    it('прежний отчёт версии помечается superseded, сбой повтора не роняет прогон', async () => {
        const { useCase, aiService } = makeUseCase({
            originals: [original('1', 't-1')],
            previousReports: [
                { id: '77', status: 'done' },
                { id: '70', status: 'superseded' },
            ],
        });
        aiService.findByTranscriptionIds.mockResolvedValueOnce([]);

        const result = await useCase.execute({ domain: DOMAIN }, NOW);

        expect(result.pairs).toBe(1);
        expect(aiService.update).toHaveBeenCalledTimes(1);
        expect(aiService.update).toHaveBeenCalledWith('77', {
            status: 'superseded',
        });
    });

    it('модель не ответила — пар нет, отчёт не пишется', async () => {
        const { useCase, created } = makeUseCase({
            originals: [original('1', 't-1')],
            focusFails: true,
        });

        const result = await useCase.execute({ domain: DOMAIN }, NOW);

        expect(result).toMatchObject({
            rerun: 0,
            pairs: 0,
            reportId: null,
            sigmaLlm: null,
        });
        expect(created).toHaveLength(0);
        expect(RETEST_DEFAULTS.timeBudgetMs).toBeLessThan(60 * 60 * 1000);
    });
});
