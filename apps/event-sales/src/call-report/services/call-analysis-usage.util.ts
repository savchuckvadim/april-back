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

/** Расход разбора по ответам провайдера (только удавшиеся вызовы). */
export function sumCompletionUsage(
    responses: readonly VibecodeStructuredCompletionWithUsage[],
): AgentAnalysisUsageDto {
    const perCall = responses.map(response =>
        completionTokensOf(response.usage),
    );
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
    };
}
