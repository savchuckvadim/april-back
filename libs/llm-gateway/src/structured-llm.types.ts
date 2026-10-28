/**
 * Контракт шлюза структурных LLM-вызовов (план
 * ai/tasks/2026-10-28-ai-provider-resilience-plan.md — «страховой полис»
 * из плана эвакуации 24.08.2026): «системный промпт + контент + strict
 * JSON-схема» уходят тому провайдеру, который сейчас жив и настроен.
 * Потребители (классификация, глубокий разбор, фокусы, ревизор, сверка)
 * провайдера не знают — только шлюз.
 */

/**
 * Провайдеры: VibeCode Битрикса, любой OpenAI-совместимый endpoint и модели
 * оркестратора контура 1 (`ai-rag`: GigaChat, Cloud.ru, Ollama, OpenAI через
 * схему в промпте — третий эшелон, в порядок по умолчанию не входит).
 */
export const LLM_PROVIDER_CODES = [
    'vibecode',
    'openai-compatible',
    'ai-rag',
] as const;
export type LlmProviderCode = (typeof LLM_PROVIDER_CODES)[number];

export const isLlmProviderCode = (value: unknown): value is LlmProviderCode =>
    typeof value === 'string' &&
    (LLM_PROVIDER_CODES as readonly string[]).includes(value);

/**
 * Как провайдер записывается в колонку `provider` таблицы ais. У VibeCode
 * исторический код `bitrix-vibecode` — отчёты и выборки по нему не рвём.
 */
export const LLM_PROVIDER_AIS_CODE = {
    vibecode: 'bitrix-vibecode',
    'openai-compatible': 'openai-compatible',
    'ai-rag': 'ai-rag',
} as const satisfies Record<LlmProviderCode, string>;

/** Опции вызова. */
export interface StructuredLlmOptions {
    /**
     * Имя модели VibeCode из настроек портала (deepAnalysisModel).
     * Запасной провайдер его игнорирует — у него своя модель из endpoint'а.
     */
    model?: string;
}

export interface StructuredLlmRequest extends StructuredLlmOptions {
    /** Домен портала: ключи и endpoint'ы — пер-портальные. */
    domain: string;
    systemPrompt: string;
    userContent: string;
    /** Имя схемы (`call_focus_form`, `call_classification`) — в теле запроса и в логах. */
    schemaName: string;
    schema: Record<string, unknown>;
}

/** Расход одного вызова; null — провайдер поле не вернул. */
export interface StructuredLlmUsage {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
}

/** Ответ: разобранный JSON по схеме, расход, фактическая модель и кто ответил. */
export interface StructuredLlmResponse {
    result: unknown;
    usage: StructuredLlmUsage;
    model: string | null;
    provider: LlmProviderCode;
}

/** Адаптер провайдера: настроен ли он для домена и сам вызов. */
export interface StructuredLlmAdapter {
    readonly code: LlmProviderCode;
    /** Почему провайдер нельзя использовать для домена (нет ключа, нет endpoint'а); null — настроен. */
    configurationIssue(domain: string): Promise<string | null>;
    complete(request: StructuredLlmRequest): Promise<StructuredLlmResponse>;
}
