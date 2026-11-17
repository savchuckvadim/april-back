import {
    DIGEST_LIFECYCLE,
    DIGEST_READINESS,
    DIGEST_STATUS,
    type DigestRecommendation,
    type ManagerDigestCard,
} from '@lib/sales-ai-analytics';
import type { PeriodDigestRunReport } from '../types/period-digest.types';

/**
 * Итог прогона итогов периода: счёт по карточкам и строки для Telegram и
 * админки — по-русски, без кодов. Чистые функции.
 */

export type PeriodDigestSaved = PeriodDigestRunReport['saved'];

/** Что итогу нужно от карточки: готовность данных и рекомендации. */
export interface PeriodDigestCardTally {
    readonly readiness: ManagerDigestCard['readiness'];
    readonly recommendations: readonly Pick<
        DigestRecommendation,
        'lifecycle' | 'status'
    >[];
}

/** Счёт по карточкам выпуска и сохранению. */
export function periodDigestReportOf(
    cards: readonly PeriodDigestCardTally[],
    saved: PeriodDigestSaved,
): PeriodDigestRunReport {
    const recommendations = cards.flatMap(card => card.recommendations);
    const lifecycle = (code: string) =>
        recommendations.filter(item => item.lifecycle === code).length;
    const readiness = (code: string) =>
        cards.filter(card => card.readiness === code).length;
    return {
        managers: cards.length,
        readiness: {
            ok: readiness(DIGEST_READINESS.ok),
            fewData: readiness(DIGEST_READINESS.fewData),
            noCalls: readiness(DIGEST_READINESS.noCalls),
        },
        recommendations: {
            active: lifecycle(DIGEST_LIFECYCLE.active),
            fresh: recommendations.filter(
                item => item.status === DIGEST_STATUS.new,
            ).length,
            fixed: lifecycle(DIGEST_LIFECYCLE.fixed),
            escalated: lifecycle(DIGEST_LIFECYCLE.escalated),
            dropped: lifecycle(DIGEST_LIFECYCLE.dropped),
        },
        saved,
    };
}

/** Строки итога: менеджеры и данные, рекомендации, сохранение. */
export function periodDigestSummaryLines(
    report: PeriodDigestRunReport,
): string[] {
    const { readiness, recommendations, saved } = report;
    return [
        `Менеджеров: ${report.managers} — данных достаточно у ` +
            `${readiness.ok}, мало данных у ${readiness.fewData}, без ` +
            `записанных звонков у ${readiness.noCalls}`,
        `Рекомендаций в работе: ${recommendations.active} (новых ` +
            `${recommendations.fresh}); закрепить: ${recommendations.fixed}, ` +
            `обсудить с РОПом: ${recommendations.escalated}, снято без ` +
            `данных: ${recommendations.dropped}`,
        `Карточек сохранено: ${saved.created + saved.updated} (новых ` +
            `${saved.created}, обновлено ${saved.updated}), без изменений: ` +
            `${saved.unchanged}`,
    ];
}
