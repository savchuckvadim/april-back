import { BadGatewayException } from '@nestjs/common';
import {
    LLM_PROMPT_DEFAULT_SYSTEM,
    LLM_PROMPT_NO_PORTAL_DOMAIN,
    LLM_PROMPT_SCHEMA_NAME,
    LLM_PROMPT_TARGETS,
    LLM_PROMPT_TEXT,
} from '../llm-prompt.const';
import {
    answerTextOf,
    LLM_PROMPT_ANSWER_SCHEMA,
    LlmPromptService,
    type LlmPromptInput,
} from '../services/llm-prompt.service';

const DOMAIN = 'garant.bitrix24.ru';

const input = (over: Partial<LlmPromptInput> = {}): LlmPromptInput => ({
    target: 'auto',
    domain: DOMAIN,
    systemPrompt: null,
    userContent: 'Сделай резюме',
    model: null,
    requestedBy: 'vadim',
    ...over,
});

const makeService = (over?: {
    gatewayResult?: unknown;
    gatewayError?: Error;
    orchestratorError?: Error;
    issues?: Record<string, string | null>;
}) => {
    const gateway = {
        complete: over?.gatewayError
            ? jest.fn().mockRejectedValue(over.gatewayError)
            : jest.fn().mockResolvedValue({
                  result: over?.gatewayResult ?? { answer: 'ответ шлюза' },
                  usage: {
                      promptTokens: 10,
                      completionTokens: 5,
                      totalTokens: 15,
                  },
                  model: 'bitrix/bitrixgpt-5.5',
                  provider: 'vibecode',
              }),
        configurationIssueOf: jest.fn((code: string) =>
            Promise.resolve(over?.issues?.[code] ?? null),
        ),
    };
    const orchestrator = {
        complete: over?.orchestratorError
            ? jest.fn().mockRejectedValue(over.orchestratorError)
            : jest.fn().mockResolvedValue('ответ модели'),
    };
    const service = new LlmPromptService(
        gateway as never,
        orchestrator as never,
    );
    return { service, gateway, orchestrator };
};

/** Часы: старт 1000, финиш 1400 → 400 мс. */
const clock = () => {
    const ticks = [1000, 1400];
    return () => ticks.shift() ?? 1400;
};

/**
 * Ручка «любой промпт»: модели контура резюме — напрямую обычным текстом,
 * провайдеры шлюза — через схему «один текст» с явным провайдером, ошибка
 * исполнителя — 502 с причиной, готовность исполнителей для формы.
 */
describe('LlmPromptService.run', () => {
    it('модель контура резюме: оркестратор, системный промпт по умолчанию, без расхода', async () => {
        const { service, orchestrator, gateway } = makeService();
        const result = await service.run(
            input({ target: 'gigachat', domain: null }),
            clock(),
        );
        expect(orchestrator.complete).toHaveBeenCalledWith(
            'gigachat',
            LLM_PROMPT_DEFAULT_SYSTEM,
            'Сделай резюме',
        );
        expect(gateway.complete).not.toHaveBeenCalled();
        expect(result).toEqual({
            text: 'ответ модели',
            provider: 'gigachat',
            model: 'gigachat',
            usage: null,
            elapsedMs: 400,
        });
    });

    it('auto: шлюз с порядком портала (providers не задан), ответ из поля answer, расход и модель провайдера', async () => {
        const { service, gateway } = makeService();
        const result = await service.run(
            input({ systemPrompt: '  Ты ревизор  ', model: 'bitrix/x' }),
            clock(),
        );
        expect(gateway.complete).toHaveBeenCalledWith({
            domain: DOMAIN,
            systemPrompt: 'Ты ревизор',
            userContent: 'Сделай резюме',
            schemaName: LLM_PROMPT_SCHEMA_NAME,
            schema: LLM_PROMPT_ANSWER_SCHEMA,
            model: 'bitrix/x',
        });
        expect(result).toEqual({
            text: 'ответ шлюза',
            provider: 'vibecode',
            model: 'bitrix/bitrixgpt-5.5',
            usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
            elapsedMs: 400,
        });
    });

    it('один провайдер шлюза: providers = [код]; без портала — домен-заглушка; модель у openai-compatible игнорируется', async () => {
        const { service, gateway } = makeService();
        await service.run(
            input({ target: 'openai-compatible', domain: null, model: 'x' }),
        );
        expect(gateway.complete).toHaveBeenCalledWith(
            expect.objectContaining({
                domain: LLM_PROMPT_NO_PORTAL_DOMAIN,
                providers: ['openai-compatible'],
            }),
        );
        expect(gateway.complete).toHaveBeenCalledWith(
            expect.not.objectContaining({ model: 'x' }),
        );
    });

    it('ответ шлюза не по схеме: строка — как есть, объект без answer — JSON', async () => {
        const text = makeService({ gatewayResult: 'голый текст' });
        await expect(text.service.run(input())).resolves.toMatchObject({
            text: 'голый текст',
        });
        const object = makeService({ gatewayResult: { foo: 1 } });
        await expect(object.service.run(input())).resolves.toMatchObject({
            text: JSON.stringify({ foo: 1 }, null, 2),
        });
    });

    it('исполнитель не ответил — 502 с причиной провайдера', async () => {
        const { service } = makeService({
            gatewayError: new Error('LLM недоступна: vibecode — нет ключа'),
        });
        await expect(service.run(input())).rejects.toMatchObject({
            constructor: BadGatewayException,
            message: `${LLM_PROMPT_TEXT.failed}: LLM недоступна: vibecode — нет ключа`,
        });
        const model = makeService({
            orchestratorError: new Error('GIGACHAT_API_KEY не задан'),
        });
        await expect(
            model.service.run(input({ target: 'gigachat' })),
        ).rejects.toBeInstanceOf(BadGatewayException);
    });
});

describe('LlmPromptService.targets', () => {
    it('все исполнители в порядке реестра; готовность провайдеров шлюза — от шлюза, VibeCode без портала — нужен портал', async () => {
        const { service, gateway } = makeService({
            issues: { 'openai-compatible': 'запасной endpoint не настроен' },
        });
        const withoutPortal = await service.targets(null);
        expect(withoutPortal.map(target => target.code)).toEqual([
            ...LLM_PROMPT_TARGETS,
        ]);
        expect(withoutPortal.find(t => t.code === 'vibecode')).toMatchObject({
            issue: LLM_PROMPT_TEXT.vibecodeNeedsPortal,
            kind: 'gateway',
            acceptsModel: true,
        });
        expect(
            withoutPortal.find(t => t.code === 'openai-compatible'),
        ).toMatchObject({ issue: 'запасной endpoint не настроен' });
        expect(withoutPortal.find(t => t.code === 'gigachat')).toMatchObject({
            issue: null,
            kind: 'model',
        });
        expect(gateway.configurationIssueOf).toHaveBeenCalledWith(
            'openai-compatible',
            LLM_PROMPT_NO_PORTAL_DOMAIN,
        );

        await service.targets(DOMAIN);
        expect(gateway.configurationIssueOf).toHaveBeenCalledWith(
            'vibecode',
            DOMAIN,
        );
    });
});

describe('answerTextOf', () => {
    it('строка как есть, answer из объекта, остальное — JSON', () => {
        expect(answerTextOf('текст')).toBe('текст');
        expect(answerTextOf({ answer: 'ответ' })).toBe('ответ');
        expect(answerTextOf({ answer: 1 })).toBe(
            JSON.stringify({ answer: 1 }, null, 2),
        );
        expect(answerTextOf(null)).toBe('null');
    });
});
