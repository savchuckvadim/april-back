/**
 * «Своя запись — не активность» (решение 17.11.2026): запись движения
 * сделок в ленту может сдвинуть `LAST_ACTIVITY_TIME` сделки, и тогда
 * следующей ночью наша же запись сошла бы за контакт после договорённости
 * (работой по сделке активность не считается вовсе). Поэтому в состоянии
 * хранится последняя активность БЕЗ нашей записи, а при оценке активность,
 * попавшая в окно вокруг нашей записи, подменяется прошлым значением.
 * Чистая функция без Битрикса и хранилищ.
 */
import { timeOf } from './deal-movement.timeline';
import type { DealMovementStateEntry } from './deal-movement.state';

/** Окно вокруг нашей записи: часы Битрикса и наши могут разойтись. */
export const DEAL_MOVEMENT_OWN_NOTE_WINDOW_MS = {
    before: 2 * 60 * 1000,
    after: 15 * 60 * 1000,
} as const;

/**
 * Последняя активность сделки без нашей записи, ISO 8601.
 *
 * - записи ещё не было (или прошлого состояния нет) — значение Битрикса;
 * - активность Битрикса в окне [запись − 2 мин; запись + 15 мин] — это
 *   наша запись: берётся прошлое значение из состояния;
 * - активность позже окна — чужая работа по сделке: значение Битрикса.
 */
export function effectiveDealLastActivityAt(
    current: string | null,
    previous: Pick<
        DealMovementStateEntry,
        'lastActivityAt' | 'notifiedAt'
    > | null,
): string | null {
    if (current === null || previous === null || previous.notifiedAt === null) {
        return current;
    }
    const currentMs = timeOf(current);
    const notifiedMs = timeOf(previous.notifiedAt);
    if (currentMs === null || notifiedMs === null) return current;
    const ours =
        currentMs >= notifiedMs - DEAL_MOVEMENT_OWN_NOTE_WINDOW_MS.before &&
        currentMs <= notifiedMs + DEAL_MOVEMENT_OWN_NOTE_WINDOW_MS.after;
    return ours ? previous.lastActivityAt : current;
}
