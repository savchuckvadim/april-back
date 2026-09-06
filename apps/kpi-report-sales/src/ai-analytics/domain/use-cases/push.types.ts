import {
    AI_ANALYTICS_PUSH_REASONS,
    AiAnalyticsPushKind,
    AiAnalyticsPushReason,
    AiAnalyticsPushStatus,
} from '../../constants/ai-analytics.const';
import { AiAnalyticsPortalSettings } from '../loaders/settings.loader';

/** Вход рассылки: из джобы крона (domain, kind, date) или ручки (+ recipients). */
export interface AiPushInput {
    domain: string;
    kind: AiAnalyticsPushKind;
    /** День запуска (YYYY-MM-DD, TZ портала); по умолчанию сегодня. */
    date?: string;
    /** Ручные получатели вместо настроек — тест «отправить себе». */
    recipients?: number[];
}

export interface AiPushResult {
    kind: AiAnalyticsPushKind;
    date: string;
    status: AiAnalyticsPushStatus;
    reason: AiAnalyticsPushReason | null;
    delivered: number[];
}

/** Контекст одного прогона, подготовленный фасадом для кейсов по виду. */
export interface AiPushRunContext {
    domain: string;
    /** День запуска (YYYY-MM-DD, TZ портала). */
    date: string;
    /** Момент запуска (полдень дня в TZ портала) — now для use-case'ов. */
    now: Date;
    settings: AiAnalyticsPortalSettings;
    /**
     * Ручные получатели. Заданы → рассылка тестовая: флаги дайджеста и
     * отметки *_sent не применяются и не пишутся.
     */
    recipients: number[] | null;
}

export const skipped = (
    kind: AiAnalyticsPushKind,
    date: string,
    reason: AiAnalyticsPushReason,
): AiPushResult => ({ kind, date, status: 'skipped', reason, delivered: [] });

export const delivered = (
    kind: AiAnalyticsPushKind,
    date: string,
    userIds: number[],
): AiPushResult =>
    userIds.length
        ? { kind, date, status: 'sent', reason: null, delivered: userIds }
        : {
              kind,
              date,
              status: 'failed',
              reason: AI_ANALYTICS_PUSH_REASONS.NOT_DELIVERED,
              delivered: [],
          };
