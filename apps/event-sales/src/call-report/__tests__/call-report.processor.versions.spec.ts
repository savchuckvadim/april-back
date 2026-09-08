import { createHash } from 'crypto';
import { CallReportProcessor } from '../queue/call-report.processor';
import { comparableFromVersions, versionDate } from '@lib/sales-ai-analytics';
import {
    buildAnalysisVersions,
    buildRegistryHash,
    CALL_REPORT_ATTRIBUTION_VERSION,
    CALL_REPORT_CLASSIFIER_VERSION,
    CALL_REPORT_PROMPT_VERSION,
    CALL_REPORT_REGISTRY_BUILTIN,
    CALL_REPORT_RUBRIC_VERSION,
} from '../contracts/call-report-versions.const';

const DOMAIN = 'test.bitrix24.ru';
const REGISTRY_CODES = ['presentation', 'cold', 'call'];

const makeJob = () =>
    ({
        id: 'job-1',
        data: {
            domain: DOMAIN,
            activityId: 101,
            dealId: 555,
            durationSec: 700,
            transcriptionId: '42',
        },
        opts: { attempts: 2 },
        attemptsMade: 0,
    }) as never;

/**
 * Минимальный набор зависимостей стадии ANALYZE: конвейер отдал звонок,
 * фокус-разбор вернул результат, intake его записал. Остальное — заглушки.
 */
const makeDeps = (analysis: Record<string, unknown> = { callType: 'cold' }) => {
    const pipeline = {
        executeAnalyze: jest.fn().mockResolvedValue({
            transcriptionId: '42',
            provider: 'yandex',
            resumeSaved: true,
            recomendationSaved: true,
            callType: 'cold',
        }),
    };
    const focusAnalysis = { run: jest.fn().mockResolvedValue(analysis) };
    const deepAnalysis = { run: jest.fn().mockResolvedValue(null) };
    const analysisIntake = {
        intake: jest.fn().mockResolvedValue({ aiId: '9', smartItemId: 777 }),
    };
    const transcriptionStore = {
        findPipelineById: jest
            .fn()
            .mockResolvedValue({ id: '42', text: 'алло, здравствуйте' }),
    };
    const contextBuilder = {
        build: jest.fn().mockResolvedValue({
            certainty: 'rich',
            history: [],
            identity: [],
        }),
        renderForPrompt: jest.fn().mockReturnValue(''),
    };
    const settingsService = {
        resolve: jest.fn().mockResolvedValue({
            deepAnalysisEnabled: true,
            deepAnalysisModel: null,
            complianceReviewEnabled: false,
        }),
    };
    const listLinker = {
        find: jest.fn().mockResolvedValue({ relatedReportIds: [] }),
    };
    const callTypeRegistry = {
        resolve: jest.fn().mockResolvedValue({
            codes: REGISTRY_CODES,
            types: {},
            source: 'builtin',
        }),
    };
    const alerts = {
        notifyIfNeeded: jest.fn().mockResolvedValue({
            status: 'skipped',
            kind: null,
            delivered: [],
        }),
    };
    const processor = new CallReportProcessor(
        pipeline as never,
        { dispatch: jest.fn() } as never,
        { createBaseItem: jest.fn() } as never,
        deepAnalysis as never,
        focusAnalysis as never,
        contextBuilder as never,
        analysisIntake as never,
        { run: jest.fn() } as never,
        transcriptionStore as never,
        settingsService as never,
        listLinker as never,
        callTypeRegistry as never,
        alerts as never,
    );
    return { processor, analysisIntake, callTypeRegistry, alerts };
};

/** Разбор, который intake получил на запись. */
const intakenAnalysis = (analysisIntake: {
    intake: jest.Mock;
}): Record<string, unknown> =>
    (analysisIntake.intake.mock.calls[0] as unknown[])[2] as Record<
        string,
        unknown
    >;

describe('CallReportProcessor — версии разбора (план AI-аналитики §5.4)', () => {
    afterEach(() => jest.clearAllMocks());

    it('каждый новый разбор несёт пять версий', async () => {
        const { processor, analysisIntake } = makeDeps();
        await processor.handleAnalyze(makeJob());

        expect(analysisIntake.intake).toHaveBeenCalledTimes(1);
        const versions = intakenAnalysis(analysisIntake).versions as Record<
            string,
            string
        >;
        expect(versions).toEqual({
            prompt: CALL_REPORT_PROMPT_VERSION,
            rubric: CALL_REPORT_RUBRIC_VERSION,
            registry: buildRegistryHash(REGISTRY_CODES),
            attribution: CALL_REPORT_ATTRIBUTION_VERSION,
            classifier: CALL_REPORT_CLASSIFIER_VERSION,
        });
        for (const value of Object.values(versions)) {
            expect(typeof value).toBe('string');
            expect(value.length).toBeGreaterThan(0);
        }
    });

    it('registry — короткий sha1 отсортированных кодов реестра домена', async () => {
        const { processor, analysisIntake, callTypeRegistry } = makeDeps();
        await processor.handleAnalyze(makeJob());

        expect(callTypeRegistry.resolve).toHaveBeenCalledWith(DOMAIN);
        const expected = createHash('sha1')
            .update('call,cold,presentation')
            .digest('hex')
            .slice(0, 12);
        const versions = intakenAnalysis(analysisIntake).versions as {
            registry: string;
        };
        expect(versions.registry).toBe(expected);
    });

    it('реестр недоступен (ошибка) — registry="builtin", разбор записывается', async () => {
        const { processor, analysisIntake, callTypeRegistry } = makeDeps();
        callTypeRegistry.resolve.mockRejectedValue(new Error('knowledge down'));
        await processor.handleAnalyze(makeJob());

        expect(analysisIntake.intake).toHaveBeenCalledTimes(1);
        const versions = intakenAnalysis(analysisIntake).versions as {
            registry: string;
            prompt: string;
        };
        expect(versions.registry).toBe(CALL_REPORT_REGISTRY_BUILTIN);
        expect(versions.prompt).toBe(CALL_REPORT_PROMPT_VERSION);
    });

    it('версии, уже проставленные разбором, не перезаписываются', async () => {
        const preset = {
            prompt: 'external-v9',
            rubric: 'sections-7-v1',
            registry: 'abc',
            attribution: '2026-01-01',
            classifier: '2026-01-01',
        };
        const { processor, analysisIntake, callTypeRegistry } = makeDeps({
            callType: 'cold',
            versions: preset,
        });
        await processor.handleAnalyze(makeJob());

        expect(intakenAnalysis(analysisIntake).versions).toEqual(preset);
        expect(callTypeRegistry.resolve).not.toHaveBeenCalled();
    });

    it('алерт РОПу вызывается после intake с id смарт-элемента', async () => {
        const { processor, analysisIntake, alerts } = makeDeps({
            callType: 'presentation',
            riskFlags: ['promise'],
        });
        await processor.handleAnalyze(makeJob());

        expect(alerts.notifyIfNeeded).toHaveBeenCalledWith(
            DOMAIN,
            expect.objectContaining({ callType: 'presentation' }),
            expect.objectContaining({ id: '42' }),
            777,
        );
        const intakeOrder = analysisIntake.intake.mock.invocationCallOrder[0];
        const alertOrder = alerts.notifyIfNeeded.mock.invocationCallOrder[0];
        expect(alertOrder).toBeGreaterThan(intakeOrder);
    });

    it('intake упал — алерт не отправляется, джоб не падает', async () => {
        const { processor, analysisIntake, alerts } = makeDeps();
        analysisIntake.intake.mockRejectedValue(new Error('bitrix down'));
        await expect(
            processor.handleAnalyze(makeJob()),
        ).resolves.toBeUndefined();
        expect(alerts.notifyIfNeeded).not.toHaveBeenCalled();
    });
});

describe('buildRegistryHash / buildAnalysisVersions', () => {
    it('хэш не зависит от порядка кодов и различает наборы', () => {
        expect(buildRegistryHash(['a', 'b'])).toBe(
            buildRegistryHash(['b', 'a']),
        );
        expect(buildRegistryHash(['a', 'b'])).not.toBe(
            buildRegistryHash(['a', 'b', 'c']),
        );
        expect(buildRegistryHash(['a', 'b'])).toHaveLength(12);
    });

    it('buildAnalysisVersions подставляет хэш реестра в registry', () => {
        expect(buildAnalysisVersions('deadbeef')).toEqual({
            prompt: CALL_REPORT_PROMPT_VERSION,
            rubric: CALL_REPORT_RUBRIC_VERSION,
            registry: 'deadbeef',
            attribution: CALL_REPORT_ATTRIBUTION_VERSION,
            classifier: CALL_REPORT_CLASSIFIER_VERSION,
        });
    });
});

/**
 * ГРАНИЦА СРАВНИМОЙ ИСТОРИИ. Правки промпта 08.09.2026 (свои названия
 * организаций + причина отказа словами клиента) меняют оценки, поэтому
 * ряды до и после смешивать нельзя: comparableFrom обязан сдвинуться.
 */
describe('версия промпта 08.09.2026 (свои названия + причина отказа)', () => {
    /** Граница до правок — версия промпта focus-v2.1 от 05.09.2026. */
    const PREVIOUS_BOUNDARY = '2026-09-05';

    it('версия промпта поднята и несёт дату разрыва', () => {
        expect(CALL_REPORT_PROMPT_VERSION).toBe('focus-v2.2-2026-09-08');
        expect(versionDate(CALL_REPORT_PROMPT_VERSION)).toBe('2026-09-08');
    });

    it('граница сравнимой истории сдвинулась вперёд', () => {
        const boundary = comparableFromVersions(
            buildAnalysisVersions('deadbeef'),
        );
        expect(boundary).toBe('2026-09-08');
        expect(boundary > PREVIOUS_BOUNDARY).toBe(true);
    });
});
