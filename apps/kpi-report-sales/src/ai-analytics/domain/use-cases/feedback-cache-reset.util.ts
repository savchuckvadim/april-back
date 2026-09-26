/**
 * Сброс кэша витрины после записи реакции: «Отработано» по алерту
 * (alert_handled) меняет пульс, несогласие (disagree, в том числе отзыв
 * с сайта) — блок несогласий повестки. Карта «вид → секции» —
 * AI_ANALYTICS_FEEDBACK_RESET_SCOPES; ключи — существующий построитель
 * SCAN-паттерна `buildResetPattern` (все даты/недели домена разом).
 *
 * Fail-open: запись уже сделана, сбой кэша не должен ронять ответ —
 * только предупреждение в лог (кэш доживёт свой TTL).
 */
import type { LoggerService } from '@nestjs/common';
import type { AiAnalyticsFeedbackKind } from '@lib/sales-ai-analytics';
import type { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import { buildResetPattern } from '../../cache/cache-key.util';
import type { AiAnalyticsCacheScope } from '../../constants/ai-analytics.const';
import { AI_ANALYTICS_FEEDBACK_RESET_SCOPES } from '../../constants/ai-feedback.const';

/** Секции кэша, которые устаревают после записи реакции этого вида. */
export function feedbackResetScopes(
    kind: AiAnalyticsFeedbackKind,
): readonly AiAnalyticsCacheScope[] {
    return AI_ANALYTICS_FEEDBACK_RESET_SCOPES[kind] ?? [];
}

/** Сбрасывает секции кэша домена под вид реакции; ошибки — в лог. */
export async function resetFeedbackCaches(
    cache: AiAnalyticsCacheService,
    domain: string,
    kind: AiAnalyticsFeedbackKind,
    logger: Pick<LoggerService, 'warn'>,
): Promise<void> {
    for (const scope of feedbackResetScopes(kind)) {
        try {
            await cache.resetByPattern(buildResetPattern(domain, scope));
        } catch (error) {
            logger.warn(
                `Кэш ${scope} домена ${domain} не сброшен после реакции ` +
                    `${kind}: ${(error as Error).message}`,
            );
        }
    }
}
