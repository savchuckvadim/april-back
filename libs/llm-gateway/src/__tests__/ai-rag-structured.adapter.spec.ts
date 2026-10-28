import { Logger } from '@nestjs/common';
import { AiRagStructuredAdapter } from '../adapters/ai-rag-structured.adapter';

const DOMAIN = 'test.bitrix24.ru';

const REQUEST = {
    domain: DOMAIN,
    systemPrompt: 'система',
    userContent: 'текст',
    schemaName: 'call_focus_form',
    schema: { type: 'object', properties: { score: { type: 'number' } } },
};

const makeAdapter = (
    values: Record<string, string> = {},
    portalModel: string | null | undefined = undefined,
    answer = '{"score": 6}',
) => {
    const orchestrator = { complete: jest.fn().mockResolvedValue(answer) };
    const portalAiSettings = {
        getByDomain: jest
            .fn()
            .mockResolvedValue(
                portalModel === undefined ? null : { llmModel: portalModel },
            ),
    };
    const config = { get: (key: string) => values[key] };
    return {
        adapter: new AiRagStructuredAdapter(
            config as never,
            orchestrator as never,
            portalAiSettings as never,
        ),
        orchestrator,
        portalAiSettings,
    };
};

describe('AiRagStructuredAdapter — модели контура 1 как третий эшелон шлюза', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });
    afterEach(() => jest.restoreAllMocks());

    it('всегда «настроен»; по умолчанию модель gigachat, схема дописана в системный промпт, ответ разобран как JSON', async () => {
        const { adapter, orchestrator } = makeAdapter();
        expect(await adapter.configurationIssue()).toBeNull();

        const response = await adapter.complete(REQUEST);

        expect(response).toEqual({
            result: { score: 6 },
            usage: {
                promptTokens: null,
                completionTokens: null,
                totalTokens: null,
            },
            model: 'gigachat',
            provider: 'ai-rag',
        });
        const [model, systemPrompt, userContent] = orchestrator.complete.mock
            .calls[0] as [string, string, string];
        expect(model).toBe('gigachat');
        expect(systemPrompt).toContain('система');
        expect(systemPrompt).toContain('"score"');
        expect(userContent).toBe('текст');
    });

    it('модель — llmModel портала; env LLM_AI_RAG_MODEL важнее; незнакомые коды игнорируются', async () => {
        const fromPortal = makeAdapter({}, 'cloudru');
        expect((await fromPortal.adapter.complete(REQUEST)).model).toBe(
            'cloudru',
        );

        const fromEnv = makeAdapter({ LLM_AI_RAG_MODEL: 'ollama' }, 'cloudru');
        expect((await fromEnv.adapter.complete(REQUEST)).model).toBe('ollama');
        expect(fromEnv.portalAiSettings.getByDomain).not.toHaveBeenCalled();

        const unknown = makeAdapter({ LLM_AI_RAG_MODEL: 'gpt-9' }, 'не модель');
        expect((await unknown.adapter.complete(REQUEST)).model).toBe(
            'gigachat',
        );
    });

    it('ответ в ```json разбирается; не-JSON — ошибка (шлюз пойдёт дальше)', async () => {
        const fenced = makeAdapter({}, undefined, '```json\n{"score": 2}\n```');
        expect((await fenced.adapter.complete(REQUEST)).result).toEqual({
            score: 2,
        });

        const garbage = makeAdapter({}, undefined, 'Оценка семь из десяти');
        await expect(garbage.adapter.complete(REQUEST)).rejects.toThrow();
    });

    it('ошибка чтения настроек портала не роняет вызов — модель по умолчанию', async () => {
        const { adapter, portalAiSettings } = makeAdapter();
        portalAiSettings.getByDomain.mockRejectedValueOnce(
            new Error('БД недоступна'),
        );
        expect((await adapter.complete(REQUEST)).model).toBe('gigachat');
    });
});
