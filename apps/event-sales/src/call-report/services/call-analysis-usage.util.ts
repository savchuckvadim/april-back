import type {
    VibecodeCompletionUsage,
    VibecodeStructuredCompletionWithUsage,
} from '@lib/vibecode';
import type { AgentAnalysisUsageDto } from '../../agent-gate/dto/agent-analysis-request.dto';

/**
 * Учёт токенов глубокого разбора: сумма по удавшимся вызовам модели (три
 * фокуса + синтез либо один цельный вызов). Чистые функции — проверяются
 * формулой, а не прогоном сервиса.
 */

/**
 * Токены одного вызова: prompt + completion; без разбивки — total_tokens
 * провайдера; ничего не вернул — null (вызов в сумму не входит).
 */
export function completionTokensOf(
    usage: VibecodeCompletionUsage,
): number | null {
    if (usage.promptTokens !== null && usage.completionTokens !== null) {
        return usage.promptTokens + usage.completionTokens;
    }
    return usage.totalTokens;
}

/** Сумма ненулевых слагаемых; все null — null. */
function sumNullable(values: readonly (number | null)[]): number | null {
    const known = values.filter((value): value is number => value !== null);
    return known.length
        ? known.reduce((total, value) => total + value, 0)
        : null;
}

/** Ответ шлюза с кодом ответившего поставщика (нет у старых адаптеров). */
export type UsageResponse = VibecodeStructuredCompletionWithUsage & {
    provider?: string;
};

/** Расход по поставщикам в порядке первого появления; без кода — не входит. */
function usageByProvider(
    responses: readonly UsageResponse[],
    perCall: readonly (number | null)[],
): AgentAnalysisUsageDto['byProvider'] {
    const byProvider = new Map<string, { tokens: number; calls: number }>();
    responses.forEach((response, index) => {
        if (!response.provider) return;
        const entry = byProvider.get(response.provider) ?? {
            tokens: 0,
            calls: 0,
        };
        entry.calls += 1;
        entry.tokens += perCall[index] ?? 0;
        byProvider.set(response.provider, entry);
    });
    if (byProvider.size === 0) return undefined;
    return [...byProvider].map(([provider, entry]) => ({ provider, ...entry }));
}

/**
 * Расход разбора по ответам провайдера (только удавшиеся вызовы); с B3 —
 * ещё поставщик первого вызова и разбивка по поставщикам, чтобы цена
 * считалась по тому, кто реально отвечал (откат на запасного внутри
 * одного разбора).
 */
export function sumCompletionUsage(
    responses: readonly UsageResponse[],
): AgentAnalysisUsageDto {
    const perCall = responses.map(response =>
        completionTokensOf(response.usage),
    );
    const byProvider = usageByProvider(responses, perCall);
    return {
        tokens: sumNullable(perCall) ?? 0,
        promptTokens: sumNullable(
            responses.map(response => response.usage.promptTokens),
        ),
        completionTokens: sumNullable(
            responses.map(response => response.usage.completionTokens),
        ),
        calls: responses.length,
        callsWithUsage: perCall.filter(tokens => tokens !== null).length,
        model:
            responses
                .map(response => response.model)
                .find((model): model is string => model !== null) ?? null,
        ...(byProvider ? { provider: byProvider[0].provider, byProvider } : {}),
    };
}
