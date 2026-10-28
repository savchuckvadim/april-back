import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CloudRuProvider } from '../infrastructure/providers/cloudru.provider';
import { ChainBuilderService } from '../application/chain-builder.service';
import { MemoryVectorStoreService } from '../infrastructure/vector-store/memory-vector-store.service';
import { CombinedCallAnalysisService } from '../application/combined-call-analysis.service';

function makeConfig(values: Record<string, string>): ConfigService {
    return {
        get: (key: string) => values[key],
    } as unknown as ConfigService;
}

function makeChain(answer: string) {
    return { invoke: jest.fn().mockResolvedValue(answer) };
}

describe('CloudRuProvider', () => {
    const chainBuilder = {
        buildResumeChain: jest.fn(),
        buildRecommendationChain: jest.fn(),
    };
    const vectorStore = {
        getRetriever: jest.fn().mockResolvedValue({}),
    };
    const combinedAnalysis = {
        run: jest.fn(),
    };

    function makeProvider(config: Record<string, string>): CloudRuProvider {
        return new CloudRuProvider(
            makeConfig(config),
            chainBuilder as unknown as ChainBuilderService,
            vectorStore as unknown as MemoryVectorStoreService,
            combinedAnalysis as unknown as CombinedCallAnalysisService,
        );
    }

    afterEach(() => jest.clearAllMocks());

    it('без CLOUDRU_API_KEY resume падает с понятной ошибкой', async () => {
        const provider = makeProvider({});
        await expect(provider.resume('текст звонка')).rejects.toThrow(
            InternalServerErrorException,
        );
        await expect(provider.resume('текст звонка')).rejects.toThrow(
            'CLOUDRU_API_KEY',
        );
    });

    it('analyzeCall делегирует объединённому анализу', async () => {
        const provider = makeProvider({ CLOUDRU_API_KEY: 'test-key' });
        const pair = { resume: 'резюме', recomendation: 'рекомендации' };
        combinedAnalysis.run.mockResolvedValue(pair);

        const result = await provider.analyzeCall('текст звонка', 'domain.ru');

        expect(result).toEqual(pair);
        expect(combinedAnalysis.run).toHaveBeenCalledTimes(1);
    });

    it('analyzeCall откатывается на два раздельных вызова при сбое объединённого', async () => {
        const provider = makeProvider({ CLOUDRU_API_KEY: 'test-key' });
        combinedAnalysis.run.mockRejectedValue(new Error('combined failed'));
        chainBuilder.buildResumeChain.mockResolvedValue(makeChain('резюме'));
        chainBuilder.buildRecommendationChain.mockResolvedValue(
            makeChain('рекомендации'),
        );

        const result = await provider.analyzeCall('текст звонка');

        expect(result).toEqual({
            resume: 'резюме',
            recomendation: 'рекомендации',
        });
        expect(chainBuilder.buildResumeChain).toHaveBeenCalledTimes(1);
        expect(chainBuilder.buildRecommendationChain).toHaveBeenCalledTimes(1);
    });

    it('resume строит цепочку и возвращает извлечённый результат', async () => {
        const provider = makeProvider({ CLOUDRU_API_KEY: 'test-key' });
        chainBuilder.buildResumeChain.mockResolvedValue(makeChain('итог'));

        const result = await provider.resume('текст звонка', 'domain.ru');

        expect(result).toBe('итог');
        expect(vectorStore.getRetriever).toHaveBeenCalledWith(
            expect.anything(),
            'cloudru',
            'domain.ru',
            'resume',
        );
    });

    /** План устойчивости к провайдерам (28.10.2026): любой промпт без RAG. */
    it('complete зовёт модель напрямую — без цепочек и ретривера — и отдаёт текст ответа', async () => {
        const provider = makeProvider({ CLOUDRU_API_KEY: 'test-key' });
        const invoke = jest.fn().mockResolvedValue({ content: '{"score": 7}' });
        jest.spyOn(
            provider as unknown as { getLlm: () => unknown },
            'getLlm',
        ).mockReturnValue({ invoke });

        const result = await provider.complete('система', 'текст');

        expect(result).toBe('{"score": 7}');
        const [messages] = invoke.mock.calls[0] as [{ content: string }[]];
        expect(messages.map(message => message.content)).toEqual([
            'система',
            'текст',
        ]);
        expect(chainBuilder.buildResumeChain).not.toHaveBeenCalled();
        expect(vectorStore.getRetriever).not.toHaveBeenCalled();
    });

    it('complete без ключа и при ошибке модели — понятная ошибка с причиной', async () => {
        await expect(makeProvider({}).complete('с', 'т')).rejects.toThrow(
            'CLOUDRU_API_KEY',
        );

        const provider = makeProvider({ CLOUDRU_API_KEY: 'k' });
        jest.spyOn(
            provider as unknown as { getLlm: () => unknown },
            'getLlm',
        ).mockReturnValue({
            invoke: jest
                .fn()
                .mockRejectedValue(
                    new Error('Request failed with status code 503'),
                ),
        });
        await expect(provider.complete('с', 'т')).rejects.toThrow(
            'status code 503',
        );
    });
});
