import { CallReportPipelineUseCase } from '../use-cases/call-report-pipeline.use-case';

const PAYLOAD = {
    domain: 'test.bitrix24.ru',
    activityId: 101,
    dealId: 555,
    durationSec: 700,
};

const CLASSIFICATION = {
    callType: 'cold',
    interlocutorRole: 'secretary',
    confidence: 0.9,
    reason: 'Проход секретаря',
};

const makeDeps = (overrides?: {
    routerError?: boolean;
    llmError?: boolean;
    noAudio?: boolean;
    classifyError?: boolean;
    combinedDisabled?: boolean;
}) => {
    const bitrix = {
        activity: {
            getAllFresh: jest.fn().mockResolvedValue({
                activities: [
                    {
                        ID: '101',
                        OWNER_ID: '555',
                        OWNER_TYPE_ID: '2',
                        FILES: overrides?.noAudio
                            ? []
                            : [{ id: 9, url: 'http://f' }],
                    },
                ],
            }),
        },
        batch: { file: { get: jest.fn() } },
        api: {
            callBatchWithConcurrency: jest
                .fn()
                .mockResolvedValue([
                    { result: { 9: { DOWNLOAD_URL: 'http://download' } } },
                ]),
        },
        deal: {
            getList: jest.fn().mockResolvedValue({
                result: [{ ID: '555', ASSIGNED_BY_ID: '7' }],
            }),
        },
        timeline: { addTimelineComment: jest.fn().mockResolvedValue({}) },
    };
    const pbxService = { init: jest.fn().mockResolvedValue({ bitrix }) };
    const router = {
        transcribe: overrides?.routerError
            ? jest.fn().mockRejectedValue(new Error('transcribe failed'))
            : jest
                  .fn()
                  .mockResolvedValue({ text: 'текст', provider: 'yandex' }),
    };
    const store = {
        startPipeline: jest.fn().mockResolvedValue({ id: '42' }),
        finishPipeline: jest.fn().mockResolvedValue({ id: '42' }),
    };
    const aiService = { create: jest.fn().mockResolvedValue({ id: '1' }) };
    const llm = {
        analyzeCall: overrides?.llmError
            ? jest.fn().mockRejectedValue(new Error('llm down'))
            : jest.fn().mockResolvedValue({
                  resume: 'резюме',
                  recomendation: 'рекомендации',
              }),
        resume: overrides?.llmError
            ? jest.fn().mockRejectedValue(new Error('llm down'))
            : jest.fn().mockResolvedValue('резюме'),
        recomendation: overrides?.llmError
            ? jest.fn().mockRejectedValue(new Error('llm down'))
            : jest.fn().mockResolvedValue('рекомендации'),
    };
    const vibecode = {
        classifyCall: overrides?.classifyError
            ? jest.fn().mockRejectedValue(new Error('vibecode down'))
            : jest.fn().mockResolvedValue(CLASSIFICATION),
    };
    const classifyInstruction = {
        resolve: jest.fn().mockResolvedValue('инструкция классификации'),
    };
    const vibeKeyResolver = {
        resolve: jest.fn().mockResolvedValue('portal-vibe-key'),
    };
    const config = {
        get: jest.fn((key: string) =>
            overrides?.combinedDisabled &&
            key === 'CALL_REPORT_COMBINED_ANALYSIS'
                ? '0'
                : undefined,
        ),
    };
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
    }) as never;

    const useCase = new CallReportPipelineUseCase(
        pbxService as never,
        router as never,
        store as never,
        aiService as never,
        llm as never,
        vibecode as never,
        vibeKeyResolver as never,
        classifyInstruction as never,
        config as never,
    );
    return {
        useCase,
        store,
        aiService,
        bitrix,
        router,
        llm,
        vibecode,
        classifyInstruction,
        vibeKeyResolver,
    };
};

describe('CallReportPipelineUseCase', () => {
    afterEach(() => jest.clearAllMocks());

    it('happy path: транскрипт done, классификация + две ais-записи, коммент в таймлайн', async () => {
        const { useCase, store, aiService, bitrix, llm } = makeDeps();
        const result = await useCase.execute(PAYLOAD);

        expect(store.startPipeline).toHaveBeenCalledWith(
            expect.objectContaining({
                dedupKey: 'test.bitrix24.ru:101',
                entityType: 'deal',
                entityId: '555',
            }),
        );
        expect(store.finishPipeline).toHaveBeenCalledWith(
            '42',
            expect.objectContaining({ status: 'done', provider: 'yandex' }),
        );
        // Резюме+рекомендации — ОДНИМ объединённым вызовом.
        expect(llm.analyzeCall).toHaveBeenCalledTimes(1);
        expect(llm.resume).not.toHaveBeenCalled();
        expect(aiService.create).toHaveBeenCalledTimes(3);
        expect(aiService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'call-classify',
                result: 'cold',
            }),
        );
        expect(aiService.create).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'call-resume' }),
        );
        expect(aiService.create).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'call-recomendation' }),
        );
        expect(bitrix.timeline.addTimelineComment).toHaveBeenCalled();
        expect(result).toEqual({
            transcriptionId: '42',
            provider: 'yandex',
            resumeSaved: true,
            recomendationSaved: true,
            callType: 'cold',
        });
    });

    it('классификатор получает подменную инструкцию и пер-портальный ключ', async () => {
        const { useCase, vibecode, classifyInstruction, vibeKeyResolver } =
            makeDeps();
        await useCase.execute(PAYLOAD);
        expect(classifyInstruction.resolve).toHaveBeenCalledWith(
            'test.bitrix24.ru',
        );
        expect(vibeKeyResolver.resolve).toHaveBeenCalledWith(
            'test.bitrix24.ru',
        );
        expect(vibecode.classifyCall).toHaveBeenCalledWith(
            'текст',
            'инструкция классификации',
            'portal-vibe-key',
        );
    });

    it('CALL_REPORT_COMBINED_ANALYSIS=0 возвращает два раздельных вызова', async () => {
        const { useCase, llm } = makeDeps({ combinedDisabled: true });
        await useCase.execute(PAYLOAD);
        expect(llm.analyzeCall).not.toHaveBeenCalled();
        expect(llm.resume).toHaveBeenCalledTimes(1);
        expect(llm.recomendation).toHaveBeenCalledTimes(1);
    });

    it('ошибка классификатора не роняет конвейер — анализ идёт дальше', async () => {
        const { useCase, aiService } = makeDeps({ classifyError: true });
        const result = await useCase.execute(PAYLOAD);
        expect(result.callType).toBeNull();
        expect(aiService.create).toHaveBeenCalledTimes(2);
        expect(aiService.create).not.toHaveBeenCalledWith(
            expect.objectContaining({ type: 'call-classify' }),
        );
        expect(result.resumeSaved).toBe(true);
    });

    it('ошибка транскрибации ставит status=error и пробрасывается', async () => {
        const { useCase, store, aiService } = makeDeps({ routerError: true });
        await expect(useCase.execute(PAYLOAD)).rejects.toThrow(
            'transcribe failed',
        );
        expect(store.finishPipeline).toHaveBeenCalledWith('42', {
            status: 'error',
        });
        expect(aiService.create).not.toHaveBeenCalled();
    });

    it('падение LLM не роняет конвейер — транскрипт сохранён', async () => {
        const { useCase, store, aiService, bitrix } = makeDeps({
            llmError: true,
        });
        const result = await useCase.execute(PAYLOAD);
        expect(store.finishPipeline).toHaveBeenCalledWith(
            '42',
            expect.objectContaining({ status: 'done' }),
        );
        // Единственная ais-запись — классификация (она независима от LLM).
        expect(aiService.create).toHaveBeenCalledTimes(1);
        expect(aiService.create).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'call-classify' }),
        );
        expect(bitrix.timeline.addTimelineComment).not.toHaveBeenCalled();
        expect(result.resumeSaved).toBe(false);
        expect(result.recomendationSaved).toBe(false);
    });

    it('отсутствие аудиофайла в активности — ошибка со status=error', async () => {
        const { useCase, store } = makeDeps({ noAudio: true });
        await expect(useCase.execute(PAYLOAD)).rejects.toThrow(
            'No audio files',
        );
        expect(store.finishPipeline).toHaveBeenCalledWith('42', {
            status: 'error',
        });
    });
});
