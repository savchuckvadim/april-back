import type {
    DigestedPart,
    FlatDigestEvent,
    PartDigestEvent,
} from './long-call.types';

/**
 * События конспектов без повторов из перекрытий. Соседние части
 * перекрываются, поэтому одно событие модель может записать дважды — в
 * конце одной части и в начале следующей. Одинаковая цитата (без учёта
 * регистра и повторных пробелов) в соседней части остаётся один раз — в
 * более ранней.
 */

export const normalizeQuote = (quote: string): string =>
    quote.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * События каждой части без повторов предыдущей части; порядок частей и
 * порядок событий внутри части не меняются. Часть без конспекта — пустой
 * список (за ней повторов искать не с чем).
 */
export function dedupeEventsByPart(
    parts: readonly DigestedPart[],
): PartDigestEvent[][] {
    let previousQuotes = new Set<string>();

    return parts.map(({ digest }) => {
        const kept = (digest?.events ?? []).filter(
            event => !previousQuotes.has(normalizeQuote(event.quote)),
        );
        previousQuotes = new Set(
            kept.map(event => normalizeQuote(event.quote)),
        );

        return kept;
    });
}

/**
 * Плоский список событий всего разговора по времени, без повторов из
 * перекрытий. Событие без времени встаёт рядом с предыдущим по порядку
 * (его собственного времени нет).
 */
export function collectDigestEvents(
    parts: readonly DigestedPart[],
): FlatDigestEvent[] {
    const eventsByPart = dedupeEventsByPart(parts);
    const keyed: { event: FlatDigestEvent; sortSec: number }[] = [];
    let sortSec = 0;
    parts.forEach(({ part }, index) => {
        for (const event of eventsByPart[index]) {
            sortSec = event.startSec ?? sortSec;
            keyed.push({
                event: { ...event, partNumber: part.number },
                sortSec,
            });
        }
    });

    return keyed
        .sort((left, right) => left.sortSec - right.sortSec)
        .map(({ event }) => event);
}
