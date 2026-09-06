/**
 * Записи обратной связи и доставки AI-аналитики в таблице ais
 * (контракт 4 плана): type/app/provider фиксированы, user_result —
 * AiAnalyticsFeedbackPayload.
 */
export const AI_ANALYTICS_FEEDBACK_TYPE = 'ai-analytics-feedback';
export const AI_ANALYTICS_FEEDBACK_APP = 'ai-analytics';
export const AI_ANALYTICS_FEEDBACK_PROVIDER = 'ai-analytics';

/** Виды записей: реакции пользователей и факты доставки push-контура. */
export const AI_ANALYTICS_FEEDBACK_KINDS = [
    'view',
    'useful',
    'not_useful',
    'disagree',
    'alert_sent',
    'alert_handled',
    'digest_sent',
    'agenda_sent',
] as const;

export type AiAnalyticsFeedbackKind =
    (typeof AI_ANALYTICS_FEEDBACK_KINDS)[number];

export function isAiAnalyticsFeedbackKind(
    value: unknown,
): value is AiAnalyticsFeedbackKind {
    return (
        typeof value === 'string' &&
        (AI_ANALYTICS_FEEDBACK_KINDS as readonly string[]).includes(value)
    );
}

/** user_result записи ais типа ai-analytics-feedback. */
export interface AiAnalyticsFeedbackPayload {
    kind: AiAnalyticsFeedbackKind;
    /** Объект реакции: 'pulse', 'agenda', 'call:<id>', 'section:<code>' и т.п. */
    object: string;
    managerId: string | null;
    transcriptionId: string | null;
    requesterUserId: string | null;
    reason: string | null;
    payload?: Record<string, unknown>;
}
