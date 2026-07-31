import { CallReportProcessor } from '../queue/call-report.processor';

const PAYLOAD = {
    domain: 'test.bitrix24.ru',
    activityId: 101,
    dealId: 555,
    durationSec: 700,
};

const makeJob = (data: Record<string, unknown>) =>
    ({
        id: 'job-1',
        data,
        opts: { attempts: 2 },
        attemptsMade: 0,
    }) as never;

const makeDeps = () => {
    const pipeline = {
        executeTranscribe: jest
            .fn()
            .mockResolvedValue({ transcriptionId: '42', provider: 'yandex' }),
        executeAnalyze: jest.fn().mockResolvedValue({
            transcriptionId: '42',
            provider: 'yandex',
            resumeSaved: true,
            recomendationSaved: true,
            callType: 'cold',
        }),
        execute: jest.fn().mockResolvedValue({
            transcriptionId: '42',
            provider: 'yandex',
            resumeSaved: true,
            recomendationSaved: true,
            callType: 'cold',
        }),
    };
    const dispatcher = { dispatch: jest.fn().mockResolvedValue({}) };
    const baseItem = { createBaseItem: jest.fn().mockResolvedValue(777) };
    const deepAnalysis = {
        run: jest.fn().mockResolvedValue({ callType: 'cold', score: 8 }),
    };
    const analysisIntake = {
        intake: jest.fn().mockResolvedValue({ aiId: '9', smartItemId: 777 }),
    };
    const transcriptionStore = {
        findPipelineById: jest
            .fn()
            .mockResolvedValue({ id: '42', text: 'алло, здравствуйте' }),
    };
    const processor = new CallReportProcessor(
        pipeline as never,
        dispatcher as never,
        baseItem as never,
        deepAnalysis as never,
        analysisIntake as never,
        transcriptionStore as never,
    );
    return {
        processor,
        pipeline,
        dispatcher,
        baseItem,
        deepAnalysis,
        analysisIntake,
        transcriptionStore,
    };
};

describe('CallReportProcessor (стадии)', () => {
    afterEach(() => jest.clearAllMocks());

    it('TRANSCRIBE выполняет стадию и ставит джоб ANALYZE с transcriptionId', async () => {
        const { processor, pipeline, dispatcher } = makeDeps();
        await processor.handleTranscribe(makeJob(PAYLOAD));

        expect(pipeline.executeTranscribe).toHaveBeenCalledWith(PAYLOAD);
        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            'call-report',
            'call-report-analyze',
            expect.objectContaining({ ...PAYLOAD, transcriptionId: '42' }),
            'test.bitrix24.ru:101:analyze',
            expect.objectContaining({ attempts: 2 }),
        );
    });

    it('ошибка TRANSCRIBE пробрасывается в Bull, ANALYZE не ставится', async () => {
        const { processor, pipeline, dispatcher } = makeDeps();
        pipeline.executeTranscribe.mockRejectedValue(
            new Error('transcribe down'),
        );
        await expect(
            processor.handleTranscribe(makeJob(PAYLOAD)),
        ).rejects.toThrow('transcribe down');
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('ANALYZE со transcriptionId запускает только стадию анализа', async () => {
        const { processor, pipeline } = makeDeps();
        await processor.handleAnalyze(
            makeJob({ ...PAYLOAD, transcriptionId: '42' }),
        );
        expect(pipeline.executeAnalyze).toHaveBeenCalledWith(
            expect.objectContaining({ transcriptionId: '42' }),
        );
        expect(pipeline.execute).not.toHaveBeenCalled();
    });

    it('легаси-джоб ANALYZE без transcriptionId прогоняет конвейер целиком', async () => {
        const { processor, pipeline } = makeDeps();
        await processor.handleAnalyze(makeJob(PAYLOAD));
        expect(pipeline.execute).toHaveBeenCalledWith(PAYLOAD);
        expect(pipeline.executeAnalyze).not.toHaveBeenCalled();
    });

    it('без createSmartItem элемент смарта не создаётся', async () => {
        const { processor, baseItem } = makeDeps();
        await processor.handleAnalyze(
            makeJob({ ...PAYLOAD, transcriptionId: '42' }),
        );
        expect(baseItem.createBaseItem).not.toHaveBeenCalled();
    });

    it('createSmartItem доводит звонок до элемента смарта', async () => {
        const { processor, baseItem } = makeDeps();
        await processor.handleAnalyze(
            makeJob({
                ...PAYLOAD,
                transcriptionId: '42',
                createSmartItem: true,
            }),
        );
        expect(baseItem.createBaseItem).toHaveBeenCalledWith('42', 'cold');
    });

    it('глубокий разбор считается и записывается через intake', async () => {
        const { processor, deepAnalysis, analysisIntake } = makeDeps();
        await processor.handleAnalyze(
            makeJob({ ...PAYLOAD, transcriptionId: '42' }),
        );
        expect(deepAnalysis.run).toHaveBeenCalledWith(
            'test.bitrix24.ru',
            'алло, здравствуйте',
            'cold',
        );
        expect(analysisIntake.intake).toHaveBeenCalledWith(
            '42',
            'call-report-analyzer',
            expect.objectContaining({ callType: 'cold' }),
        );
    });

    it('пустой транскрипт — разбор пропускается, джоб не падает', async () => {
        const { processor, deepAnalysis, analysisIntake, transcriptionStore } =
            makeDeps();
        transcriptionStore.findPipelineById.mockResolvedValue({
            id: '42',
            text: null,
        });
        await processor.handleAnalyze(
            makeJob({ ...PAYLOAD, transcriptionId: '42' }),
        );
        expect(deepAnalysis.run).not.toHaveBeenCalled();
        expect(analysisIntake.intake).not.toHaveBeenCalled();
    });

    it('разбор не удался (null) — intake не вызывается, джоб успешен', async () => {
        const { processor, deepAnalysis, analysisIntake } = makeDeps();
        deepAnalysis.run.mockResolvedValue(null);
        await expect(
            processor.handleAnalyze(
                makeJob({ ...PAYLOAD, transcriptionId: '42' }),
            ),
        ).resolves.toBeUndefined();
        expect(analysisIntake.intake).not.toHaveBeenCalled();
    });

    it('падение intake не роняет джоб (транскрипт уже сохранён)', async () => {
        const { processor, analysisIntake } = makeDeps();
        analysisIntake.intake.mockRejectedValue(new Error('bitrix down'));
        await expect(
            processor.handleAnalyze(
                makeJob({ ...PAYLOAD, transcriptionId: '42' }),
            ),
        ).resolves.toBeUndefined();
    });

    it('падение создания смарта не роняет джоб (данные уже в БД)', async () => {
        const { processor, baseItem } = makeDeps();
        baseItem.createBaseItem.mockRejectedValue(new Error('bitrix down'));
        await expect(
            processor.handleAnalyze(
                makeJob({
                    ...PAYLOAD,
                    transcriptionId: '42',
                    createSmartItem: true,
                }),
            ),
        ).resolves.toBeUndefined();
    });
});
