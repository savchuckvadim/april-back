/**
 * Отзыв руководителя о разборе звонка (решения владельца 18.11.2026,
 * техрешение ai/tasks/2026-11-19-call-reviews-design.md, этап 2).
 *
 * Запись — обычная обратная связь (`ai-analytics-feedback`, вид
 * `call_review`, объект `call:<transcriptionId>`); эта нагрузка едет в её
 * `payload`. Один актуальный отзыв на автора и звонок: прежний уходит в
 * superseded. Менеджеру отзывы не показываются нигде.
 */

/** К чему относится замечание «не так». */
export const AI_ANALYTICS_CALL_REVIEW_ITEM_KINDS = [
    'section',
    'objection',
    'methodology',
    'fact',
    'call_type',
] as const;
export type AiAnalyticsCallReviewItemKind =
    (typeof AI_ANALYTICS_CALL_REVIEW_ITEM_KINDS)[number];

/** Кто оставил отзыв: руководитель по структуре или суперпользователь. */
export const AI_ANALYTICS_CALL_REVIEW_AUTHOR_ROLES = [
    'leader',
    'superuser',
] as const;
export type AiAnalyticsCallReviewAuthorRole =
    (typeof AI_ANALYTICS_CALL_REVIEW_AUTHOR_ROLES)[number];

/** Лимиты отзыва: длина текстов, число пунктов, шкала оценки. */
export const AI_ANALYTICS_CALL_REVIEW_LIMITS = {
    /** Пунктов «не так» в одном отзыве. */
    items: 30,
    /** Код раздела / id подсветки / код пункта методики. */
    itemRef: 200,
    /** Снимок подписи пункта. */
    itemLabel: 300,
    /** Комментарий к пункту. */
    itemComment: 2000,
    /** Общий комментарий — «целый рассказ». */
    comment: 20000,
    /** Имя автора (снимок). */
    authorName: 300,
    /** Шкала оценки руководителя. */
    scoreMin: 1,
    scoreMax: 10,
} as const;

/** Замечание «не так» к пункту разбора. */
export interface AiAnalyticsCallReviewItem {
    kind: AiAnalyticsCallReviewItemKind;
    /** Код раздела, id подсветки или код пункта методики. */
    ref: string;
    /** Подпись пункта на момент отзыва (≤ 300). */
    label: string;
    /** Что не так (≤ 2000). */
    comment: string;
}

/** Нагрузка записи `call_review`. */
export interface AiAnalyticsCallReviewPayload {
    /** Согласен ли руководитель с оценкой AI. */
    agree: boolean;
    /** Своя оценка руководителя 1–10; null — не поставил. */
    leaderScore: number | null;
    /** Оценка AI по шкале витрины (до 10) на момент отзыва; null — не было. */
    aiScore: number | null;
    /** Id записи разбора в `ais`, к которой относится отзыв. */
    analysisId: string;
    /** Замечания «не так» (≤ 30). */
    items: AiAnalyticsCallReviewItem[];
    /** Общий комментарий (≤ 20 000). */
    comment: string;
    authorRole: AiAnalyticsCallReviewAuthorRole;
    /** Имя автора на момент отзыва. */
    authorName: string;
}

/** Объект записи отзыва: `call:<номер расшифровки>`. */
export const callReviewObjectOf = (transcriptionId: string): string =>
    `call:${transcriptionId}`;

const asRecord = (value: unknown): Record<string, unknown> | null =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;

const asText = (value: unknown, max: number): string =>
    typeof value === 'string' ? value.slice(0, max) : '';

/** Оценка 1–10 (целая); иначе null. */
export function callReviewScoreOf(value: unknown): number | null {
    const { scoreMin, scoreMax } = AI_ANALYTICS_CALL_REVIEW_LIMITS;
    return typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= scoreMin &&
        value <= scoreMax
        ? value
        : null;
}

/** Оценка AI по шкале 0–10 (дробная, как на витрине); иначе null. */
const aiScoreOf = (value: unknown): number | null =>
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= AI_ANALYTICS_CALL_REVIEW_LIMITS.scoreMax
        ? value
        : null;

const isItemKind = (value: unknown): value is AiAnalyticsCallReviewItemKind =>
    typeof value === 'string' &&
    (AI_ANALYTICS_CALL_REVIEW_ITEM_KINDS as readonly string[]).includes(value);

const isAuthorRole = (
    value: unknown,
): value is AiAnalyticsCallReviewAuthorRole =>
    typeof value === 'string' &&
    (AI_ANALYTICS_CALL_REVIEW_AUTHOR_ROLES as readonly string[]).includes(
        value,
    );

function parseItems(value: unknown): AiAnalyticsCallReviewItem[] {
    if (!Array.isArray(value)) return [];
    const limits = AI_ANALYTICS_CALL_REVIEW_LIMITS;
    return value.slice(0, limits.items).flatMap(raw => {
        const item = asRecord(raw);
        if (!item || !isItemKind(item.kind)) return [];
        return [
            {
                kind: item.kind,
                ref: asText(item.ref, limits.itemRef),
                label: asText(item.label, limits.itemLabel),
                comment: asText(item.comment, limits.itemComment),
            },
        ];
    });
}

/**
 * `payload` записи обратной связи → отзыв; чужая форма (нет согласия, роли
 * автора или записи разбора) — null. Тексты длиннее лимитов обрезаются,
 * пункты чужого вида пропускаются: старая запись не роняет чтение.
 */
export function parseCallReviewPayload(
    value: unknown,
): AiAnalyticsCallReviewPayload | null {
    const raw = asRecord(value);
    if (!raw || typeof raw.agree !== 'boolean') return null;
    if (!isAuthorRole(raw.authorRole)) return null;
    if (typeof raw.analysisId !== 'string' || raw.analysisId === '') {
        return null;
    }
    const limits = AI_ANALYTICS_CALL_REVIEW_LIMITS;
    return {
        agree: raw.agree,
        leaderScore: callReviewScoreOf(raw.leaderScore),
        aiScore: aiScoreOf(raw.aiScore),
        analysisId: raw.analysisId,
        items: parseItems(raw.items),
        comment: asText(raw.comment, limits.comment),
        authorRole: raw.authorRole,
        authorName: asText(raw.authorName, limits.authorName),
    };
}
