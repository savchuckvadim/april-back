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
});
