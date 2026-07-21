import { CallReportPipelineUseCase } from '../use-cases/call-report-pipeline.use-case';

const PAYLOAD = {
    domain: 'test.bitrix24.ru',
    activityId: 101,
    dealId: 555,
    durationSec: 700,
};

const makeDeps = (overrides?: {
    routerError?: boolean;
    llmError?: boolean;
    noAudio?: boolean;
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
        resume: overrides?.llmError
            ? jest.fn().mockRejectedValue(new Error('llm down'))
            : jest.fn().mockResolvedValue('резюме'),
        recomendation: overrides?.llmError
            ? jest.fn().mockRejectedValue(new Error('llm down'))
            : jest.fn().mockResolvedValue('рекомендации'),
    };
    const config = { get: jest.fn(() => undefined) };
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
        config as never,
    );
    return { useCase, store, aiService, bitrix, router };
};

describe('CallReportPipelineUseCase', () => {
    afterEach(() => jest.clearAllMocks());

    it('happy path: транскрипт done, две ais-записи, коммент в таймлайн', async () => {
        const { useCase, store, aiService, bitrix } = makeDeps();
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
        expect(aiService.create).toHaveBeenCalledTimes(2);
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
        });
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

    it('падение GigaChat не роняет конвейер — транскрипт сохранён', async () => {
        const { useCase, store, aiService, bitrix } = makeDeps({
            llmError: true,
        });
        const result = await useCase.execute(PAYLOAD);
        expect(store.finishPipeline).toHaveBeenCalledWith(
            '42',
            expect.objectContaining({ status: 'done' }),
        );
        expect(aiService.create).not.toHaveBeenCalled();
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
