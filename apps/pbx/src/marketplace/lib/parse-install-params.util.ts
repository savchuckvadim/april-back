/**
 * Разбор параметров установки маркетплейс-приложения Битрикс24.
 *
 * Битрикс доставляет токены двумя независимыми каналами (могут прийти оба):
 *  - событие ONAPPINSTALL (server-to-server): токены в JSON-поле `auth`;
 *  - открытие iframe мастера установки (PLACEMENT=DEFAULT): токены в
 *    POST-полях AUTH_ID / REFRESH_ID / AUTH_EXPIRES.
 *
 * Утилиты чистые (без Nest/HTTP) — покрываются unit-тестами напрямую.
 */

export type BitrixInstallRequestSource = Record<string, unknown> | undefined;

export enum InstallChannel {
    /** Событие ONAPPINSTALL (server-to-server callback) */
    EVENT = 'event',
    /** Открытие iframe мастера установки (PLACEMENT=DEFAULT) */
    PLACEMENT = 'placement',
    /** DTO от фронта (front/apps/bitrix перед installFinish) */
    FRONT = 'front',
    /** Открытие приложения/плейсмента (каждый запуск iframe) */
    OPEN = 'open',
    /** Канал не распознан */
    UNKNOWN = 'unknown',
}

export interface BitrixInstallTokenPayload {
    channel: InstallChannel;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    domain?: string;
    application_token?: string;
    member_id?: string;
    /** Выданные права (APPLICATION_SCOPE / auth.scope) */
    scope?: string;
    lang?: string;
}

interface BitrixInstallAuthPayload {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    application_token?: string;
    domain?: string;
    member_id?: string;
    scope?: string;
}

function getStringValue(
    source: BitrixInstallRequestSource,
    key: string,
): string | undefined {
    const value = source?.[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function pick(
    body: BitrixInstallRequestSource,
    query: BitrixInstallRequestSource,
    key: string,
): string | undefined {
    return getStringValue(body, key) ?? getStringValue(query, key);
}

export function parseExpiresIn(value?: string | number): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}

function parseAuthJson(raw?: string): BitrixInstallAuthPayload {
    if (!raw) {
        return {};
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return {};
        }
        const auth = parsed as Record<string, unknown>;
        return {
            access_token:
                typeof auth.access_token === 'string'
                    ? auth.access_token
                    : undefined,
            refresh_token:
                typeof auth.refresh_token === 'string'
                    ? auth.refresh_token
                    : undefined,
            expires_in: parseExpiresIn(
                typeof auth.expires_in === 'string' ||
                    typeof auth.expires_in === 'number'
                    ? auth.expires_in
                    : undefined,
            ),
            application_token:
                typeof auth.application_token === 'string'
                    ? auth.application_token
                    : undefined,
            domain: typeof auth.domain === 'string' ? auth.domain : undefined,
            member_id:
                typeof auth.member_id === 'string' ? auth.member_id : undefined,
            scope: typeof auth.scope === 'string' ? auth.scope : undefined,
        };
    } catch {
        return {};
    }
}

/**
 * Нормализует body+query запроса установки от Битрикса в единый payload.
 *
 * Приоритеты источников:
 *  - в канале EVENT поля из `auth` (application_token, member_id, domain)
 *    приоритетнее верхнеуровневых полей;
 *  - application_token: `APPLICATION_TOKEN` (body iframe-канала, живой лог
 *    2026-07-14) → `auth.application_token` → `APP_SID` (последний fallback:
 *    APP_SID — сессионный ID iframe, НЕ секрет приложения!);
 *  - `APPLICATION_SCOPE` (iframe) / `auth.scope` (событие) → scope.
 */
export function parseInstallParams(
    body: BitrixInstallRequestSource,
    query: BitrixInstallRequestSource,
): BitrixInstallTokenPayload {
    const event = pick(body, query, 'event');
    const placement = pick(body, query, 'PLACEMENT');
    const domain = pick(body, query, 'DOMAIN');
    const appSid = pick(body, query, 'APP_SID');
    const applicationToken = pick(body, query, 'APPLICATION_TOKEN');
    const scope = pick(body, query, 'APPLICATION_SCOPE');
    const memberId = pick(body, query, 'member_id');
    const lang = pick(body, query, 'LANG');

    if (event === 'ONAPPINSTALL') {
        const auth = parseAuthJson(pick(body, query, 'auth'));
        return {
            channel: InstallChannel.EVENT,
            access_token: auth.access_token,
            refresh_token: auth.refresh_token,
            expires_in: auth.expires_in,
            domain: auth.domain ?? domain,
            application_token:
                auth.application_token ?? applicationToken ?? appSid,
            member_id: auth.member_id ?? memberId,
            scope: auth.scope ?? scope,
            lang,
        };
    }

    if (placement === 'DEFAULT') {
        return {
            channel: InstallChannel.PLACEMENT,
            access_token: pick(body, query, 'AUTH_ID'),
            refresh_token: pick(body, query, 'REFRESH_ID'),
            expires_in: parseExpiresIn(pick(body, query, 'AUTH_EXPIRES')),
            domain,
            application_token: applicationToken ?? appSid,
            member_id: memberId,
            scope,
            lang,
        };
    }

    return { channel: InstallChannel.UNKNOWN, domain, member_id: memberId };
}

export interface BitrixOpenPayload extends BitrixInstallTokenPayload {
    /** Код места встройки из POST (DEFAULT для основного приложения) */
    placement?: string;
    /** Контекст встройки (PLACEMENT_OPTIONS, JSON-строка) */
    placementOptions?: string;
}

/**
 * Разбор параметров ОТКРЫТИЯ приложения/плейсмента (каждый запуск iframe).
 *
 * В отличие от установки, PLACEMENT здесь может быть любым (DEFAULT для
 * основного приложения, CRM_DEAL_DETAIL_TAB и т.п. для виджетов) — токены
 * AUTH_ID/REFRESH_ID приходят при каждом открытии и подлежат сохранению
 * (бесплатное обновление пары без oauth-сервера).
 */
export function parseOpenParams(
    body: BitrixInstallRequestSource,
    query: BitrixInstallRequestSource,
): BitrixOpenPayload {
    return {
        channel: InstallChannel.OPEN,
        access_token: pick(body, query, 'AUTH_ID'),
        refresh_token: pick(body, query, 'REFRESH_ID'),
        expires_in: parseExpiresIn(pick(body, query, 'AUTH_EXPIRES')),
        domain: pick(body, query, 'DOMAIN'),
        application_token:
            pick(body, query, 'APPLICATION_TOKEN') ??
            pick(body, query, 'APP_SID'),
        member_id: pick(body, query, 'member_id'),
        scope: pick(body, query, 'APPLICATION_SCOPE'),
        lang: pick(body, query, 'LANG'),
        placement: pick(body, query, 'PLACEMENT'),
        placementOptions: pick(body, query, 'PLACEMENT_OPTIONS'),
    };
}

/** Достаточно ли данных в payload, чтобы сохранить установку. */
export function isInstallable(payload: BitrixInstallTokenPayload): boolean {
    return Boolean(
        payload.access_token && payload.refresh_token && payload.domain,
    );
}

/** ISO-дата истечения access_token (по умолчанию 3600 секунд). */
export function getExpiresAtIso(expiresIn?: number, now: number = Date.now()) {
    return new Date(now + (expiresIn ?? 3600) * 1000).toISOString();
}
