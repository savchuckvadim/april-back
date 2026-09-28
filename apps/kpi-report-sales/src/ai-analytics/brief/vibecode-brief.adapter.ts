import { Injectable, Logger } from '@nestjs/common';
import { VibeCodeClient, VibeKeyResolverService } from '@lib/vibecode';
import {
    AI_BRIEF_COMPARE_REASONS,
    AI_BRIEF_COMPARE_TEXTS,
    AI_BRIEF_JSON_SCHEMA,
    AI_BRIEF_MODEL_GROUPS,
    AI_BRIEF_PROMPT_VERSION,
    AI_BRIEF_SCHEMA_NAME,
    formatFactValue,
    formatRuDateRange,
    packJson,
    type AiBriefFact,
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
 * Строка факта для модели: готовая фраза, с чем сравниваем, прошлый
 * период, изменение, норма, план и ссылка — всё числами пакета в том же
 * формате, которым факт-чек разбирает буллеты.
 */
function factLine(fact: AiBriefFact): string {
    const parts = [`- [${fact.code}] ${fact.text}`];
    if (fact.basis !== undefined) parts.push(`сравнение: ${fact.basis}`);
    if (fact.comparable && typeof fact.prev === 'number') {
        parts.push(`прошлый период: ${formatFactValue(fact.prev, fact.unit)}`);
    }
    if (fact.comparable && typeof fact.delta === 'number') {
        const pct =
            typeof fact.deltaPct === 'number'
                ? ` (${formatFactValue(fact.deltaPct, 'pct')})`
                : '';
        parts.push(
            `изменение: ${formatFactValue(fact.delta, fact.unit)}${pct}`,
        );
    }
    if (typeof fact.norm === 'number') {
        parts.push(`норма: ${formatFactValue(fact.norm, fact.unit)}`);
    }
    if (typeof fact.plan === 'number') {
        parts.push(`план: ${formatFactValue(fact.plan, fact.unit)}`);
    }
    if (typeof fact.link === 'string') parts.push(`ссылка: ${fact.link}`);

    return parts.join('; ');
}

/** Строка о прошлом периоде: даты словами либо причина, почему его нет. */
function compareLine(pack: AiEvidencePack): string {
    const { previousPeriod, reason } = pack.compare;
    if (previousPeriod !== null && reason === null) {
        return `Прошлый период: ${formatRuDateRange(previousPeriod.from, previousPeriod.to)}.`;
    }

    return `${AI_BRIEF_COMPARE_TEXTS[reason ?? AI_BRIEF_COMPARE_REASONS.noData]}.`;
}

/**
 * Что уходит в модель: версия промпта, прошлый период, группы буллетов
 * нейросети (изменения и фокус — действия выводят правила пакета),
 * готовые фразы фактов с кодами и канонический JSON пакета. Фразы
 * дублируют JSON намеренно — модель переписывает готовое число, а не
 * форматирует его сама (иначе факт-чек ловил бы форматирование).
 */
export function buildUserContent(pack: AiEvidencePack): string {
    return [
        `Версия промпта: ${AI_BRIEF_PROMPT_VERSION}.`,
        compareLine(pack),
        `Группы буллетов: ${AI_BRIEF_MODEL_GROUPS.join(', ')}.`,
        `Пакет фактов (${pack.facts.length}), packHash ${pack.hash}:`,
        ...pack.facts.map(factLine),
        'JSON пакета:',
        packJson(pack.facts, pack.compare),
    ].join('\n');
}
