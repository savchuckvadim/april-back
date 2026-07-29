import { LlmOrchestratorService } from '../application/llm-orchestrator.service';
import { LlmProvider } from '../domain/interfaces/llm-provider.interface';

function makeProvider(label: string): jest.Mocked<LlmProvider> {
    return {
        resume: jest.fn().mockResolvedValue(`${label}:resume`),
        recomendation: jest.fn().mockResolvedValue(`${label}:recomendation`),
        analyzeCall: jest.fn().mockResolvedValue({
            resume: `${label}:resume`,
            recomendation: `${label}:recomendation`,
        }),
    };
}

describe('LlmOrchestratorService', () => {
    const giga = makeProvider('giga');
    const cloudru = makeProvider('cloudru');
    const openai = makeProvider('openai');
    const ollama = makeProvider('ollama');
    const fake = makeProvider('fake');

    const orchestrator = new LlmOrchestratorService(
        giga as unknown as never,
        cloudru as unknown as never,
        openai as unknown as never,
        ollama as unknown as never,
        fake as unknown as never,
    );

    afterEach(() => jest.clearAllMocks());

    it.each([
        ['gigachat', giga],
        ['cloudru', cloudru],
        ['openai', openai],
        ['ollama', ollama],
        ['fake', fake],
    ] as const)('делегирует resume провайдеру %s', async (model, provider) => {
        const result = await orchestrator.resume(model, 'query');
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(provider.resume).toHaveBeenCalledWith('query', undefined);
        expect(result).toBe(`${model === 'gigachat' ? 'giga' : model}:resume`);
    });

    it.each([
        ['gigachat', giga],
        ['cloudru', cloudru],
        ['openai', openai],
        ['ollama', ollama],
        ['fake', fake],
    ] as const)(
        'делегирует recomendation провайдеру %s',
        async (model, provider) => {
            const result = await orchestrator.recomendation(model, 'query');
            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(provider.recomendation).toHaveBeenCalledWith(
                'query',
                undefined,
            );
            expect(result).toBe(
                `${model === 'gigachat' ? 'giga' : model}:recomendation`,
            );
        },
    );

    it.each([
        ['gigachat', giga],
        ['cloudru', cloudru],
        ['openai', openai],
        ['ollama', ollama],
        ['fake', fake],
    ] as const)(
        'делегирует analyzeCall провайдеру %s',
        async (model, provider) => {
            const result = await orchestrator.analyzeCall(
                model,
                'query',
                'domain.ru',
            );
            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(provider.analyzeCall).toHaveBeenCalledWith(
                'query',
                'domain.ru',
            );
            const label = model === 'gigachat' ? 'giga' : model;
            expect(result).toEqual({
                resume: `${label}:resume`,
                recomendation: `${label}:recomendation`,
            });
        },
    );
});
