import {
    isLlmProviderCode,
    type LlmProviderCode,
} from './structured-llm.types';

/**
 * Порядок провайдеров по умолчанию: VibeCode, затем OpenAI-совместимый
 * запасной. `ai-rag` (модели контура 1 со схемой в промпте) — только явно,
 * через LLM_PROVIDER_ORDER или настройку портала, после проверки согласия
 * на выборке.
 */
export const DEFAULT_LLM_PROVIDER_ORDER: readonly LlmProviderCode[] = [
    'vibecode',
    'openai-compatible',
];

/** Порядок из env LLM_PROVIDER_ORDER («openai-compatible,vibecode»); незнакомые коды отбрасываются, пусто — по умолчанию. */
export function resolveProviderOrder(
    raw: string | undefined,
): LlmProviderCode[] {
    return (
        normalizeProviderOrder((raw ?? '').split(',')) ?? [
            ...DEFAULT_LLM_PROVIDER_ORDER,
        ]
    );
}

/** Список кодов → порядок без мусора и дублей; пусто — null. */
export function normalizeProviderOrder(
    codes: readonly unknown[],
): LlmProviderCode[] | null {
    const valid = codes
        .map(code => (typeof code === 'string' ? code.trim() : ''))
        .filter(isLlmProviderCode);
    const unique = [...new Set(valid)];
    return unique.length ? unique : null;
}
