/**
 * Чистые построители ключей кэша модуля ai-analytics и TTL повестки.
 *
 * Схема ключей (читаемая, без хэшей):
 *   sales-ai-analytics:v1:{domain}:settings              — настройки + готовность
 *   sales-ai-analytics:v1:{domain}:pulse:{endDate}       — пульс до даты
 *   sales-ai-analytics:v1:{domain}:agenda:{weekKey}      — повестка недели
 *   sales-ai-analytics:v1:{domain}:access:v2:{userId}    — периметр requester'а
 *   sales-ai-analytics:v1:{domain}:overview:v2:{from}_{to}:{usersKey}:{confirmedOnly}
 *                                                        — обзор менеджер × тип (Фаза 1b)
 *   sales-ai-analytics:v1:{domain}:managers:org          — раскладка ростера по отделам/группам
 *
 * Кэшируется полный результат по домену, периметр requester'а применяется
 * после чтения (иначе ключ пришлось бы плодить на каждого пользователя).
 */
import { shiftDate, isoWeekday, toPortalDate } from '@lib/sales-ai-analytics';
import {
    AI_ANALYTICS_AGENDA_MAX_TTL_SECONDS,
    AI_ANALYTICS_AGENDA_MIN_TTL_SECONDS,
    AI_ANALYTICS_CACHE_PREFIX,
    AI_ANALYTICS_CACHE_SECTIONS,
    AiAnalyticsCacheScope,
} from '../constants/ai-analytics.const';
import {
    AI_ANALYTICS_OVERVIEW_DEFAULT_DAYS,
    AI_ANALYTICS_OVERVIEW_TTL_SECONDS,
} from '../constants/ai-overview.const';
import { dayStartUtc } from '../domain/loaders/period.util';

const { SETTINGS, PULSE, AGENDA, ACCESS, OVERVIEW, MANAGERS } =
    AI_ANALYTICS_CACHE_SECTIONS;

export function buildSettingsKey(domain: string): string {
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${SETTINGS}`;
}

export function buildPulseKey(domain: string, endDate: string): string {
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${PULSE}:${endDate}`;
}

export function buildAgendaKey(domain: string, weekKey: string): string {
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${AGENDA}:${weekKey}`;
}

/**
 * Версия формы периметра в кэше: v2 — RequesterAccess с isSuperUser.
 * Меняется вместе с формой, чтобы не читать записи старой формы. Версия
 * стоит после секции — сброс по `access:*`/домену её захватывает.
 */
const ACCESS_KEY_VERSION = 'v2';

export function buildAccessKey(domain: string, userId: string): string {
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${ACCESS}:${ACCESS_KEY_VERSION}:${userId}`;
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
 * TTL повестки: до 00:00 следующего понедельника в TZ портала (ключ —
 * неделя планёрки), не меньше минимального порога и не больше потолка
 * AI_ANALYTICS_AGENDA_MAX_TTL_SECONDS (15 минут): несогласия копятся по
 * «сейчас», и сброс кэша при новом несогласии может разминуться с идущим
 * расчётом — короткий TTL ограничивает жизнь такого устаревшего набора.
 */
export function agendaTtlSeconds(now: Date, timeZone: string): number {
    const today = toPortalDate(now, timeZone);
    const daysToMonday = (8 - isoWeekday(today)) % 7 || 7;
    const nextMonday = dayStartUtc(shiftDate(today, daysToMonday), timeZone);
    const seconds = Math.floor((nextMonday.getTime() - now.getTime()) / 1000);
    return Math.min(
        Math.max(seconds, AI_ANALYTICS_AGENDA_MIN_TTL_SECONDS),
        AI_ANALYTICS_AGENDA_MAX_TTL_SECONDS,
    );
}

/**
 * Ключ обзора (план 6.4): период, нормализованный список менеджеров
 * (buildReportUsersKey — дедуп, сортировка) и флаг confirmedOnly. Он же —
 * jobId джобы SALES_AI_ANALYTICS_OVERVIEW: повторный клик подписывается на
 * идущий расчёт, а не плодит второй. Версия v2 — строки с источником
 * стажа (levelSource passport, since/sinceSource) и meta.excludedBeforeComparable:
 * кэш закрытых периодов (30 дней) старой формы не читается.
 */
const OVERVIEW_KEY_VERSION = 'v2';

export function buildOverviewKey(
    domain: string,
    from: string,
    to: string,
    usersKey: string,
    confirmedOnly: boolean,
): string {
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${OVERVIEW}:${OVERVIEW_KEY_VERSION}:${from}_${to}:${usersKey}:${confirmedOnly ? 1 : 0}`;
}

/** Раскладка ростера ОП по отделам и группам (ManagerOrgLoader). */
export function buildManagersOrgKey(domain: string): string {
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${MANAGERS}:org`;
}

/** Первый день месяца даты YYYY-MM-DD. */
function monthStartOf(day: string): string {
    return `${day.slice(0, 7)}-01`;
}

/**
 * TTL обзора по положению периода относительно «сегодня» в TZ портала:
 * период включает сегодня — live (180 с); закончился до сегодня — past
 * (1 ч, разборы ещё доезжают); целиком в закрытых месяцах — closed (30 дней).
 */
export function overviewTtlSeconds(
    to: string,
    now: Date,
    timeZone: string,
): number {
    const today = toPortalDate(now, timeZone);
    if (to >= today) return AI_ANALYTICS_OVERVIEW_TTL_SECONDS.live;
    if (to < monthStartOf(today)) {
        return AI_ANALYTICS_OVERVIEW_TTL_SECONDS.closed;
    }
    return AI_ANALYTICS_OVERVIEW_TTL_SECONDS.past;
}

/**
 * Период обзора по умолчанию и окно прогрева: скользящие 4 недели,
 * заканчивающиеся вчерашним днём портала (сегодняшние звонки ещё идут).
 */
export function defaultOverviewPeriod(today: string): {
    from: string;
    to: string;
} {
    const to = shiftDate(today, -1);
    return {
        from: shiftDate(to, -(AI_ANALYTICS_OVERVIEW_DEFAULT_DAYS - 1)),
        to,
    };
}
