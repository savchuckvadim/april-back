import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { LlmOrchestratorService } from '@lib/ai-rag';
import {
    StructuredLlmGateway,
    describeLlmError,
    type StructuredLlmUsage,
} from '@lib/llm-gateway';
import {
    isLlmPromptModelTarget,
    LLM_PROMPT_DEFAULT_SYSTEM,
    LLM_PROMPT_GATEWAY_PROVIDER,
    LLM_PROMPT_NO_PORTAL_DOMAIN,
    LLM_PROMPT_SCHEMA_NAME,
    LLM_PROMPT_TARGET_META,
    LLM_PROMPT_TARGETS,
    LLM_PROMPT_TEXT,
    type LlmPromptGatewayTarget,
    type LlmPromptModelTarget,
    type LlmPromptTarget,
    type LlmPromptTargetMeta,
} from '../llm-prompt.const';

export interface LlmPromptInput {
    target: LlmPromptTarget;
    /** Домен портала для ключей; null — общие ключи приложения. */
    domain: string | null;
    /** Системный промпт; null или пусто — нейтральный по умолчанию. */
    systemPrompt: string | null;
    userContent: string;
    /** Имя модели для исполнителей, которые его принимают. */
    model: string | null;
    /** Логин админа — в журнал: вызов платный. */
    requestedBy: string | null;
}

export interface LlmPromptResult {
    text: string;
    provider: string;
    model: string | null;
    elapsedMs: number;
    usage: StructuredLlmUsage | null;
}

export interface LlmPromptTargetInfo extends LlmPromptTargetMeta {
    code: LlmPromptTarget;
    /** Почему недоступен для домена; null — настроен или проверяется вызовом. */
    issue: string | null;
}

/**
 * Схема «один текстовый ответ» для провайдеров шлюза: они умеют только
 * strict JSON, а ручке нужен обычный текст.
 */
export const LLM_PROMPT_ANSWER_SCHEMA: Record<string, unknown> = {
    type: 'object',
    properties: {
        answer: {
            type: 'string',
            description: 'Полный ответ на запрос обычным текстом',
        },
    },
    required: ['answer'],
    additionalProperties: false,
};

/** Текст ответа из результата шлюза: поле answer, иначе строка, иначе JSON. */
export function answerTextOf(result: unknown): string {
    if (typeof result === 'string') return result;
    if (
        result !== null &&
        typeof result === 'object' &&
        'answer' in result &&
        typeof (result as { answer: unknown }).answer === 'string'
    ) {
        return (result as { answer: string }).answer;
    }
    return JSON.stringify(result, null, 2);
}

type LlmPromptOutcome = Omit<LlmPromptResult, 'elapsedMs'>;

/**
 * Ручка «любой промпт любой моделью» (решение владельца 01.11.2026):
 * модели контура резюме — напрямую через оркестратор (`complete`, обычный
 * текст), провайдеры шлюза разборов — через strict-схему «один текст».
 * Ничего не сохраняет: ответ только возвращается, вызов пишется в журнал.
 *
 * `@Injectable` без bitrix-состояния: домен приходит параметром.
 */
@Injectable()
export class LlmPromptService {
    private readonly logger = new Logger(LlmPromptService.name);

    constructor(
        private readonly gateway: StructuredLlmGateway,
        private readonly orchestrator: LlmOrchestratorService,
    ) {}

    /** Исполнители с подписями и готовностью для домена (сеть не трогается). */
    targets(domain: string | null): Promise<LlmPromptTargetInfo[]> {
        return Promise.all(
            LLM_PROMPT_TARGETS.map(async code => ({
                code,
                ...LLM_PROMPT_TARGET_META[code],
                issue: await this.issueOf(code, domain),
            })),
        );
    }

    /** Выполнить промпт; провайдер не ответил — 502 с его причиной. */
    async run(
        input: LlmPromptInput,
        now: () => number = Date.now,
    ): Promise<LlmPromptResult> {
        const startedAt = now();
        const systemPrompt =
            input.systemPrompt?.trim() || LLM_PROMPT_DEFAULT_SYSTEM;
        this.logger.log(
            `Произвольный промпт: ${input.requestedBy ?? 'без логина'} → ${input.target}${input.domain ? ` (${input.domain})` : ''}, ${input.userContent.length} знаков`,
        );
        try {
            const outcome = isLlmPromptModelTarget(input.target)
                ? await this.viaOrchestrator(
                      input.target,
                      systemPrompt,
                      input.userContent,
                  )
                : await this.viaGateway(input.target, systemPrompt, input);
            return { ...outcome, elapsedMs: now() - startedAt };
        } catch (error) {
            const text = describeLlmError(error);
            this.logger.warn(
                `Произвольный промпт (${input.target}) не выполнен: ${text}`,
            );
            throw new BadGatewayException(`${LLM_PROMPT_TEXT.failed}: ${text}`);
        }
    }

    private async viaOrchestrator(
        model: LlmPromptModelTarget,
        systemPrompt: string,
        userContent: string,
    ): Promise<LlmPromptOutcome> {
        const text = await this.orchestrator.complete(
            model,
            systemPrompt,
            userContent,
        );
        return { text, provider: model, model, usage: null };
    }

    private async viaGateway(
        target: LlmPromptGatewayTarget,
        systemPrompt: string,
        input: LlmPromptInput,
    ): Promise<LlmPromptOutcome> {
        const provider = LLM_PROMPT_GATEWAY_PROVIDER[target];
        const model =
            input.model && LLM_PROMPT_TARGET_META[target].acceptsModel
                ? input.model
                : null;
        const response = await this.gateway.complete({
            domain: input.domain ?? LLM_PROMPT_NO_PORTAL_DOMAIN,
            systemPrompt,
            userContent: input.userContent,
            schemaName: LLM_PROMPT_SCHEMA_NAME,
            schema: LLM_PROMPT_ANSWER_SCHEMA,
            ...(model ? { model } : {}),
            ...(provider ? { providers: [provider] } : {}),
        });
        return {
            text: answerTextOf(response.result),
            provider: response.provider,
            model: response.model,
            usage: response.usage,
        };
    }

    /** Готовность: модели и auto решаются вызовом; VibeCode без портала — нет. */
    private issueOf(
        code: LlmPromptTarget,
        domain: string | null,
    ): Promise<string | null> {
        if (isLlmPromptModelTarget(code) || code === 'auto') {
            return Promise.resolve(null);
        }
        if (code === 'vibecode' && domain === null) {
            return Promise.resolve(LLM_PROMPT_TEXT.vibecodeNeedsPortal);
        }
        return this.gateway.configurationIssueOf(
            code,
            domain ?? LLM_PROMPT_NO_PORTAL_DOMAIN,
        );
    }
}
