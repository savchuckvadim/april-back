import {
    CallAnalysisRerunService,
    callTypeOfAnalysis,
} from '../services/call-analysis-rerun.service';

/**
 * Общий шаг повторного прогона (test-retest и переразбор): расшифровка с
 * таймкодами, паспорт тем же построителем, тип звонка из старой записи,
 * модель портала, расход в колонки ais. Записей не создаёт, Битрикс не
 * трогает.
 */
const ROW = {
    id: 't-1',
    domain: 'gsr.bitrix24.ru',
    text: 'расшифровка',
    segments: [{ startSec: 0, endSec: 3, speaker: 'unknown', text: 'Алло' }],
    durationSec: '600',
};

const USAGE = {
    tokens: 1200,
    promptTokens: 1000,
    completionTokens: 200,
    calls: 4,
    callsWithUsage: 4,
    model: 'gpt-x',
};

function makeService(
    options: { row?: Record<string, unknown>; dto?: unknown } = {},
) {
    const transcriptionStore = {
        findPipelineById: jest.fn().mockResolvedValue(options.row ?? ROW),
    };
    const focusAnalysis = {
        run: jest.fn().mockResolvedValue(
            options.dto === undefined
                ? {
                      callType: 'presentation',
                      summary: 'итог',
                      usage: USAGE,
                  }
                : options.dto,
        ),
    };
    const contextBuilder = {
        build: jest.fn().mockResolvedValue({ certainty: 'high' }),
        renderForPrompt: jest.fn().mockReturnValue('ПАСПОРТ'),
    };
    const llmPrice = { resolvePerThousand: jest.fn().mockResolvedValue(1.5) };
    const service = new CallAnalysisRerunService(
        transcriptionStore as never,
        focusAnalysis as never,
        contextBuilder as never,
        llmPrice as never,
    );
    return {
        service,
        transcriptionStore,
        focusAnalysis,
        contextBuilder,
        llmPrice,
    };
}

describe('CallAnalysisRerunService', () => {
    it('зовёт фокус-разбор с таймкодами, типом классификатора, паспортом и моделью; считает расход по цене портала', async () => {
        const { service, focusAnalysis } = makeService();
        const outcome = await service.rerun({
            transcriptionId: 't-1',
            source: { classifierCallType: 'cold', callType: 'presentation' },
            model: 'gpt-x',
        });

        expect(focusAnalysis.run).toHaveBeenCalledWith(
            'gsr.bitrix24.ru',
            '[00:00] Алло',
            'cold',
            'ПАСПОРТ',
            { model: 'gpt-x' },
        );
        expect(outcome).toMatchObject({
            row: { id: 't-1' },
            dto: { callType: 'presentation' },
            usage: { tokens_count: 1200, price: 1.8 },
        });
    });

    it('без сегментов — текст; без модели портала — опции не передаются; без учёта токенов — колонки пустые', async () => {
        const { service, focusAnalysis, llmPrice } = makeService({
            row: { ...ROW, segments: null },
            dto: { callType: 'cold', summary: 'итог' },
        });
        const outcome = await service.rerun({
            transcriptionId: 't-1',
            source: { callType: 'cold' },
            model: null,
        });
        expect(focusAnalysis.run).toHaveBeenCalledWith(
            'gsr.bitrix24.ru',
            'расшифровка',
            'cold',
            'ПАСПОРТ',
            undefined,
        );
        expect(outcome?.usage).toEqual({});
        expect(llmPrice.resolvePerThousand).not.toHaveBeenCalled();
    });

    it('пустая расшифровка — null без вызова модели; модель не ответила — null', async () => {
        const empty = makeService({ row: { ...ROW, text: '', segments: [] } });
        await expect(
            empty.service.rerun({
                transcriptionId: 't-1',
                source: {},
                model: null,
            }),
        ).resolves.toBeNull();
        expect(empty.focusAnalysis.run).not.toHaveBeenCalled();

        const silent = makeService({ dto: null });
        await expect(
            silent.service.rerun({
                transcriptionId: 't-1',
                source: {},
                model: null,
            }),
        ).resolves.toBeNull();
    });

    it('сбой паспорта не мешает разбору — без паспорта', async () => {
        const { service, contextBuilder, focusAnalysis } = makeService();
        contextBuilder.build.mockRejectedValue(new Error('CRM недоступна'));
        await service.rerun({
            transcriptionId: 't-1',
            source: {},
            model: null,
        });
        const [, , , passport] = focusAnalysis.run.mock.calls[0] as unknown[];
        expect(passport).toBeUndefined();
    });

    it('тип звонка: приор классификатора, иначе callType, иначе null', () => {
        expect(
            callTypeOfAnalysis({ classifierCallType: 'cold', callType: 'x' }),
        ).toBe('cold');
        expect(callTypeOfAnalysis({ callType: 'presentation' })).toBe(
            'presentation',
        );
        expect(callTypeOfAnalysis({})).toBeNull();
        expect(callTypeOfAnalysis(null)).toBeNull();
    });
});
