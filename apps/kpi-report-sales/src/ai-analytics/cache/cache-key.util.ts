/**
 * Чистые построители ключей кэша модуля ai-analytics и TTL повестки.
 *
 * Схема ключей (читаемая, без хэшей):
 *   sales-ai-analytics:v1:{domain}:settings              — настройки + готовность
 *   sales-ai-analytics:v1:{domain}:pulse:{endDate}       — пульс до даты
 *   sales-ai-analytics:v1:{domain}:agenda:{weekKey}      — повестка недели
 *   sales-ai-analytics:v1:{domain}:access:{userId}       — периметр requester'а
 *
 * Кэшируется полный результат по домену, периметр requester'а применяется
 * после чтения (иначе ключ пришлось бы плодить на каждого пользователя).
 */
import { shiftDate, isoWeekday, toPortalDate } from '@lib/sales-ai-analytics';
import {
    AI_ANALYTICS_AGENDA_MIN_TTL_SECONDS,
    AI_ANALYTICS_CACHE_PREFIX,
    AI_ANALYTICS_CACHE_SECTIONS,
    AiAnalyticsCacheScope,
} from '../constants/ai-analytics.const';
import { dayStartUtc } from '../domain/loaders/period.util';

const { SETTINGS, PULSE, AGENDA, ACCESS } = AI_ANALYTICS_CACHE_SECTIONS;

export function buildSettingsKey(domain: string): string {
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${SETTINGS}`;
}

export function buildPulseKey(domain: string, endDate: string): string {
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${PULSE}:${endDate}`;
}

export function buildAgendaKey(domain: string, weekKey: string): string {
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${AGENDA}:${weekKey}`;
}

export function buildAccessKey(domain: string, userId: string): string {
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${ACCESS}:${userId}`;
}

/** SCAN-паттерн сброса по scope; access-периметр сбрасывается вместе с all. */
export function buildResetPattern(
    domain: string,
    scope: AiAnalyticsCacheScope,
): string {
    if (scope === 'all') return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:*`;
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${scope}:*`;
}

/**
 * TTL повестки: до 00:00 следующего понедельника в TZ портала (повестка
 * недели неизменна до смены недели), но не меньше минимального порога.
 */
export function agendaTtlSeconds(now: Date, timeZone: string): number {
    const today = toPortalDate(now, timeZone);
    const daysToMonday = (8 - isoWeekday(today)) % 7 || 7;
    const nextMonday = dayStartUtc(shiftDate(today, daysToMonday), timeZone);
    const seconds = Math.floor((nextMonday.getTime() - now.getTime()) / 1000);
    return Math.max(seconds, AI_ANALYTICS_AGENDA_MIN_TTL_SECONDS);
}
