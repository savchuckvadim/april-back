/**
 * Порт модели для AI-резюме (луковая архитектура: use-case знает порт, а
 * не провайдера). Реализация — `VibeCodeBriefAdapter` поверх
 * `VibeCodeClient.structuredCompletionWithUsage`; подменяется в тестах и
 * при смене провайдера LLM без правки use-case'ов.
 */
import type { AiEvidencePack } from '@lib/sales-ai-analytics';

/** Расход одного вызова модели вместе с длинами текстов (оценка по длине). */
export interface AiBriefLlmUsage {
    /** Токенов по данным провайдера; null — `usage` не пришёл. */
    totalTokens: number | null;
    /** Модель из ответа провайдера; null — не вернул. */
    model: string | null;
    /** Символов промпта (система + пакет фактов) — вход оценки по длине. */
    promptChars: number;
    /** Символов ответа модели — вход оценки по длине. */
    completionChars: number;
}

/** Ответ модели: сырой JSON по схеме резюме и расход вызова. */
export interface AiBriefLlmResult {
    /** Разобранный JSON ответа; форму проверяет `validateBriefPayload`. */
    payload: unknown;
    usage: AiBriefLlmUsage;
}

/** Модель резюме: ключ портала и strict-JSON вызов по пакету фактов. */
export interface AiBriefLlmPort {
    /**
     * Ключ LLM портала; null — ключа нет, резюме собирается шаблоном с
     * причиной `no-llm-key` (штатная деградация §5.4).
     */
    resolveKey(domain: string): Promise<string | null>;

    /** Строгий JSON-вызов модели по пакету фактов. */
    complete(pack: AiEvidencePack, apiKey: string): Promise<AiBriefLlmResult>;
}

/** DI-токен порта: провайдер регистрируется по нему в модуле резюме. */
export const AI_BRIEF_LLM_PORT = 'AI_BRIEF_LLM_PORT' as const;
