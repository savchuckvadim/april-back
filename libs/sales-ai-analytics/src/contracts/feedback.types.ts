/**
 * Записи обратной связи и доставки AI-аналитики в таблице ais
 * (контракт 4 плана): type/app/provider фиксированы, user_result —
 * AiAnalyticsFeedbackPayload.
 */
import type { RopMarkPick, RopMarkReason } from '../model/rop-mark';

export const AI_ANALYTICS_FEEDBACK_TYPE = 'ai-analytics-feedback';
export const AI_ANALYTICS_FEEDBACK_APP = 'ai-analytics';
export const AI_ANALYTICS_FEEDBACK_PROVIDER = 'ai-analytics';

/**
 * Виды записей: реакции пользователей, факты доставки push-контура и
 * слепая метка руководителя по звонку недели (`rop_mark`, план §4.11).
 */
export const AI_ANALYTICS_FEEDBACK_KINDS = [
    'view',
    'useful',
    'not_useful',
    'disagree',
    'alert_sent',
    'alert_handled',
    'digest_sent',
    'agenda_sent',
    'rop_mark',
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

/**
 * Слепая метка руководителя по звонку недели (`kind: 'rop_mark'`, план
 * §4.11 и §12): согласен ли он с оценкой AI, своя оценка, разделы, почему
 * так и как лучше. Едет в `payload` записи обратной связи.
 *
 * ⚠ Слепота — свойство ручки витрины, а не звонка: до сохранения метки
 * наша ручка не отдаёт колонки оценки AI, но карточку разбора в Битрикс
 * руководитель открыть может, и там оценка видна. Поэтому `blind` —
 * не константа, а факт: первая метка ставится вслепую, повторная (после
 * того как ручка раскрыла оценку) — уже нет.
 */
export interface AiAnalyticsRopMarkPayload {
    /** Согласен ли руководитель с оценкой AI по этому звонку. */
    agree: boolean;
    /** Своя оценка руководителя, шкала 1–10; null — не поставил. */
    ropScore: number | null;
    /** Коды разделов рубрики, к которым относится замечание. */
    sections: string[];
    /** Почему так: что руководитель услышал в звонке. */
    why: string;
    /** Как лучше: что сделать в следующий раз. */
    howTo: string;
    /** Почему звонок попал в подбор недели (uncertain_type/best_score/random). */
    reason: RopMarkReason;
    /** Метка поставлена до раскрытия оценки AI на ручке витрины. */
    blind: boolean;
    /** Ключ недели подбора 'YYYY-Www' (дубль activity_id записи). */
    weekKey: string;
}

/**
 * Нагрузка записи подбора недели (тип ais `ai-analytics-rop-mark`,
 * ключ — 'YYYY-Www', план §3.1): три звонка с причинами и зерно, по
 * которому подбор воспроизводится.
 */
export interface AiAnalyticsRopMarkPickPayload {
    weekKey: string;
    /** Зерно подбора `seedOf(domain, weekKey)` — для воспроизводимости. */
    seed: number;
    /** Момент подбора, ISO (UTC). */
    generatedAt: string;
    /** Подобранные звонки в порядке причин подбора. */
    calls: RopMarkPick[];
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
