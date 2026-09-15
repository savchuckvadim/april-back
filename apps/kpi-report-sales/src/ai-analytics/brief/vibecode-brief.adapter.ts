import { Injectable, Logger } from '@nestjs/common';
import { VibeCodeClient, VibeKeyResolverService } from '@lib/vibecode';
import {
    AI_BRIEF_JSON_SCHEMA,
    AI_BRIEF_PROMPT_VERSION,
    AI_BRIEF_SCHEMA_NAME,
    packJson,
    type AiEvidencePack,
} from '@lib/sales-ai-analytics';
import { AI_BRIEF_SYSTEM_PROMPT } from '../constants/ai-brief.const';
import type { AiBriefLlmPort, AiBriefLlmResult } from './ai-brief-llm.port';

/**
 * Адаптер порта резюме на VibeCode: strict-JSON вызов по схеме
 * `AI_BRIEF_JSON_SCHEMA` с учётом токенов.
 *
 * Ключ — пер-портальный (`VibeKeyResolverService.resolve(domain)`,
 * Portal.keys.vibeKey); портала без ключа не бывает ошибкой ручки:
 * `resolveKey` отдаёт null, и резюме собирается шаблоном с причиной
 * `no-llm-key` (§5.4). Ошибка самого вызова наружу не глушится — её
 * обрабатывает джоба (error-конверт + WS :error + rethrow).
 *
 * `@Injectable` без bitrix-состояния: домен приходит параметром.
 */
@Injectable()
export class VibeCodeBriefAdapter implements AiBriefLlmPort {
    private readonly logger = new Logger(VibeCodeBriefAdapter.name);

    constructor(
        private readonly client: VibeCodeClient,
        private readonly keys: VibeKeyResolverService,
    ) {}

    async resolveKey(domain: string): Promise<string | null> {
        try {
            return await this.keys.resolve(domain);
        } catch (error) {
            this.logger.warn(
                `Резюме без модели (${domain}): ${(error as Error).message}`,
            );
            return null;
        }
    }

    async complete(
        pack: AiEvidencePack,
        apiKey: string,
    ): Promise<AiBriefLlmResult> {
        const userContent = buildUserContent(pack);
        const { result, usage, model } =
            await this.client.structuredCompletionWithUsage(
                AI_BRIEF_SYSTEM_PROMPT,
                userContent,
                AI_BRIEF_SCHEMA_NAME,
                AI_BRIEF_JSON_SCHEMA,
                apiKey,
            );

        return {
            payload: result,
            usage: {
                totalTokens: usage.totalTokens,
                model,
                promptChars: AI_BRIEF_SYSTEM_PROMPT.length + userContent.length,
                completionChars: JSON.stringify(result ?? null).length,
            },
        };
    }
}

/**
 * Что уходит в модель: версия промпта, готовые фразы фактов с кодами и
 * канонический JSON пакета. Фразы дублируют JSON намеренно — модель
 * переписывает готовое число, а не форматирует его сама (иначе факт-чек
 * ловил бы форматирование).
 */
export function buildUserContent(pack: AiEvidencePack): string {
    const lines = pack.facts.map(fact => `- [${fact.code}] ${fact.text}`);

    return [
        `Версия промпта: ${AI_BRIEF_PROMPT_VERSION}.`,
        `Пакет фактов (${pack.facts.length}), packHash ${pack.hash}:`,
        ...lines,
        'JSON пакета:',
        packJson(pack.facts),
    ].join('\n');
}
