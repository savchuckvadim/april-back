/**
 * Окно ежедневной сводки отзывов о разборах: прошлые сутки по Москве
 * (00:00–24:00). Москва без перехода на летнее время — смещение +3 ч, как
 * у границ дней админ-списков (`@lib/call-lib/admin-list`).
 */

const DAY_MS = 86_400_000;
const MOSCOW_OFFSET_MS = 3 * 3_600_000;

/** Сутки сводки: день YYYY-MM-DD по Москве и его границы в UTC. */
export interface CallReviewsDigestWindow {
    day: string;
    /** Начало дня по Москве, включительно. */
    from: Date;
    /** Начало следующего дня по Москве, НЕ включительно. */
    to: Date;
}

/** Прошлые сутки по Москве относительно `now`. */
export function previousMoscowDay(now: Date): CallReviewsDigestWindow {
    const moscow = new Date(now.getTime() + MOSCOW_OFFSET_MS);
    const todayStart =
        Date.UTC(
            moscow.getUTCFullYear(),
            moscow.getUTCMonth(),
            moscow.getUTCDate(),
        ) - MOSCOW_OFFSET_MS;
    const from = new Date(todayStart - DAY_MS);
    return {
        day: new Date(from.getTime() + MOSCOW_OFFSET_MS)
            .toISOString()
            .slice(0, 10),
        from,
        to: new Date(todayStart),
    };
}
