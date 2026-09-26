/**
 * Лёгкая идемпотентность реакций витрины в пределах дня портала (один
 * автор, один объект):
 *  - оценка useful / not_useful — один слот: клик той же оценкой, что и
 *    последняя оценка дня, возвращает её id без записи; противоположная
 *    оценка пишется, а прежние оценки слота уходят в superseded —
 *    актуальной остаётся последняя;
 *  - alert_handled — один раз в день: повтор возвращает id прежней записи.
 * Кандидаты — актуальные записи дня, которые use-case берёт тем же
 * listInPeriod (одна выборка по индексу domain/type/created_at, без
 * superseded), здесь — только чистое сравнение.
 */
import type { AiAnalyticsFeedbackKind } from '@lib/sales-ai-analytics';
import {
    AI_ANALYTICS_DAILY_ONCE_FEEDBACK_KINDS,
    AI_ANALYTICS_RATE_FEEDBACK_KINDS,
} from '../../constants/ai-feedback.const';
import type { AiAnalyticsFeedbackRecord } from '../../store/ai-analytics-feedback.store';

/** Ключ повтора: кто, что и о чём (домен задаёт выборка). */
export interface FeedbackDedupKey {
    kind: AiAnalyticsFeedbackKind;
    object: string;
    requesterUserId: string;
}

/**
 * Решение по новой реакции: вернуть id уже записанной (reuse) или
 * записать новую и заместить перечисленные записи (write).
 */
export type FeedbackWriteDecision =
    | { action: 'reuse'; id: string }
    | { action: 'write'; supersedeIds: string[] };

const writeOnly = (): FeedbackWriteDecision => ({
    action: 'write',
    supersedeIds: [],
});

const hasKind = (
    kinds: readonly AiAnalyticsFeedbackKind[],
    kind: AiAnalyticsFeedbackKind,
): boolean => kinds.includes(kind);

/** Оценка useful / not_useful (один слот на автора, объект и день)? */
export function isRateFeedbackKind(kind: AiAnalyticsFeedbackKind): boolean {
    return hasKind(AI_ANALYTICS_RATE_FEEDBACK_KINDS, kind);
}

/** Реакция вида «один раз в день» (повтор возвращает прежний id)? */
export function isDailyOnceFeedbackKind(
    kind: AiAnalyticsFeedbackKind,
): boolean {
    return hasKind(AI_ANALYTICS_DAILY_ONCE_FEEDBACK_KINDS, kind);
}

/** Нужны ли записи дня, чтобы решить судьбу реакции. */
export function needsSameDayLookup(kind: AiAnalyticsFeedbackKind): boolean {
    return isRateFeedbackKind(kind) || isDailyOnceFeedbackKind(kind);
}

/** Bitrix-id в каноническом виде: '0512' и '512' — один пользователь. */
function normalizeUserId(value: string): string {
    const trimmed = value.trim();
    const numeric = Number(trimmed);
    return trimmed !== '' && Number.isInteger(numeric)
        ? String(numeric)
        : trimmed;
}

/** Записи того же автора по тому же объекту (без автора — push-контур). */
function sameAuthorAndObject(
    records: readonly AiAnalyticsFeedbackRecord[],
    key: FeedbackDedupKey,
): AiAnalyticsFeedbackRecord[] {
    const requester = normalizeUserId(key.requesterUserId);
    return records.filter(
        record =>
            record.object === key.object &&
            record.requesterUserId !== null &&
            normalizeUserId(record.requesterUserId) === requester,
    );
}

/** Числовые id ais: сначала по длине, потом по строке ('9' < '10'). */
function compareIds(left: string, right: string): number {
    if (left.length !== right.length) return left.length - right.length;
    return left < right ? -1 : left > right ? 1 : 0;
}

/** Самая свежая запись: по created_at, при равенстве — по id. */
function newestRecord(
    records: readonly AiAnalyticsFeedbackRecord[],
): AiAnalyticsFeedbackRecord | null {
    return records.reduce<AiAnalyticsFeedbackRecord | null>((best, record) => {
        if (!best) return record;
        const diff = record.createdAt.getTime() - best.createdAt.getTime();
        if (diff !== 0) return diff > 0 ? record : best;
        return compareIds(record.id, best.id) > 0 ? record : best;
    }, null);
}

/** Уже записанная реакция с тем же ключом среди записей дня; иначе null. */
export function findSameDayReaction(
    records: readonly AiAnalyticsFeedbackRecord[],
    key: FeedbackDedupKey,
): AiAnalyticsFeedbackRecord | null {
    return (
        sameAuthorAndObject(records, key).find(
            record => record.kind === key.kind,
        ) ?? null
    );
}

/**
 * Что делать с новой реакцией по записям дня: оценка — слот (та же
 * оценка, что последняя, → reuse; иная → write с заменой всех оценок
 * слота), alert_handled — reuse при повторе, прочие виды — просто write.
 */
export function decideFeedbackWrite(
    records: readonly AiAnalyticsFeedbackRecord[],
    key: FeedbackDedupKey,
): FeedbackWriteDecision {
    if (isRateFeedbackKind(key.kind)) {
        const slot = sameAuthorAndObject(records, key).filter(record =>
            isRateFeedbackKind(record.kind),
        );
        const latest = newestRecord(slot);
        if (latest?.kind === key.kind) {
            return { action: 'reuse', id: latest.id };
        }
        return { action: 'write', supersedeIds: slot.map(record => record.id) };
    }
    if (isDailyOnceFeedbackKind(key.kind)) {
        const existing = findSameDayReaction(records, key);
        return existing ? { action: 'reuse', id: existing.id } : writeOnly();
    }
    return writeOnly();
}
