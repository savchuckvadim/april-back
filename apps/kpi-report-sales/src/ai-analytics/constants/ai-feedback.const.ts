/**
 * Виды обратной связи AI-аналитики в разрезе того, КТО их пишет и ЧТО они
 * меняют (контракт 4 плана ai/tasks/ai-sales-analytics-plan.md).
 *
 * Полный справочник видов (`AI_ANALYTICS_FEEDBACK_KINDS`) живёт в
 * @lib/sales-ai-analytics и нужен внутренним писателям: push-контуру
 * (digest_sent / agenda_sent), алертам event-sales (alert_sent) и слепой
 * проверке руководителя (rop_mark). Витрина принимает от пользователя
 * только подмножество ниже — иначе любой мог бы записать служебный вид и
 * тем подавить дайджест или алерт.
 */
import type { AiAnalyticsFeedbackKind } from '@lib/sales-ai-analytics';
import type { AiAnalyticsCacheScope } from './ai-analytics.const';

/** Виды, которые пользователь может записать через `POST ai-analytics/feedback`. */
export const AI_ANALYTICS_USER_FEEDBACK_KINDS = [
    'view',
    'useful',
    'not_useful',
    'disagree',
    'alert_handled',
] as const satisfies readonly AiAnalyticsFeedbackKind[];
export type AiAnalyticsUserFeedbackKind =
    (typeof AI_ANALYTICS_USER_FEEDBACK_KINDS)[number];

/**
 * Реакции, которые считает свод «Обратная связь» досье менеджера:
 * без просмотров (view) и без служебных видов доставки/меток.
 */
export const AI_ANALYTICS_REACTION_KINDS = [
    'useful',
    'not_useful',
    'disagree',
    'alert_handled',
] as const satisfies readonly AiAnalyticsUserFeedbackKind[];
export type AiAnalyticsReactionKind =
    (typeof AI_ANALYTICS_REACTION_KINDS)[number];

/**
 * Служебные виды: их пишут push-контур (digest_sent / agenda_sent),
 * алерты event-sales (alert_sent) и слепая проверка руководителя
 * (rop_mark). В пользовательский список обратной связи они не попадают.
 */
export const AI_ANALYTICS_SERVICE_FEEDBACK_KINDS = [
    'alert_sent',
    'digest_sent',
    'agenda_sent',
    'rop_mark',
] as const satisfies readonly AiAnalyticsFeedbackKind[];

/**
 * Оценка «полезно / не полезно» — один слот на автора, объект и день
 * портала: повтор той же оценки возвращает id прежней записи, смена
 * оценки пишет новую запись, а прежние оценки слота уходят в superseded.
 */
export const AI_ANALYTICS_RATE_FEEDBACK_KINDS = [
    'useful',
    'not_useful',
] as const satisfies readonly AiAnalyticsUserFeedbackKind[];

/**
 * «Один раз в день»: повтор той же реакции (домен, автор, вид, объект)
 * в пределах дня портала не пишет дубль, а возвращает id уже
 * существующей записи. disagree сюда не входит — у повторного
 * несогласия может быть новая причина.
 */
export const AI_ANALYTICS_DAILY_ONCE_FEEDBACK_KINDS = [
    'alert_handled',
] as const satisfies readonly AiAnalyticsUserFeedbackKind[];

/**
 * Реакции только для руководителей (cup/op/group): «Отработано» по
 * алерту закрывает сигнал в пульсе для всего отдела, поэтому менеджер
 * его не ставит (403).
 */
export const AI_ANALYTICS_LEADER_ONLY_FEEDBACK_KINDS = [
    'alert_handled',
] as const satisfies readonly AiAnalyticsUserFeedbackKind[];

/**
 * Какие секции кэша устаревают после записи реакции: «Отработано» по
 * алерту меняет пульс, несогласие — блок несогласий повестки. Остальные
 * виды кэш витрины не трогают.
 */
export const AI_ANALYTICS_FEEDBACK_RESET_SCOPES: Partial<
    Record<AiAnalyticsFeedbackKind, readonly AiAnalyticsCacheScope[]>
> = {
    alert_handled: ['pulse'],
    disagree: ['agenda'],
};
