import { CookieOptions, Request, Response } from 'express';
import { CABINET_DEFAULTS } from '../domain/cabinet.constants';
import { CabinetConfig } from '../config/cabinet.config';

/**
 * Refresh-токен входа с сайта — в httpOnly-cookie: JS страницы его не
 * видит (защита от XSS), access живёт только в памяти вкладки.
 *
 * Cookie только для сайта (`bitrix.april-app.ru` → `api.pbx.april-app.ru`:
 * один «сайт» april-app.ru, SameSite=Lax её пропускает). Во фрейме Битрикса
 * (чужой сайт) cookie не используется вообще — там Bearer из сессии фрейма.
 * Путь — только ручки входа: на остальные запросы cookie не уходит.
 */
function cookieOptions(config: CabinetConfig): CookieOptions {
    const domain = config.cookieDomain();
    return {
        httpOnly: true,
        secure: config.cookieSecure(),
        sameSite: 'lax',
        path: CABINET_DEFAULTS.refreshCookiePath,
        ...(domain ? { domain } : {}),
    };
}

export function setRefreshCookie(
    res: Response,
    config: CabinetConfig,
    token: string,
    expiresAt: Date,
): void {
    res.cookie(CABINET_DEFAULTS.refreshCookieName, token, {
        ...cookieOptions(config),
        expires: expiresAt,
    });
}

export function clearRefreshCookie(res: Response, config: CabinetConfig): void {
    res.clearCookie(CABINET_DEFAULTS.refreshCookieName, cookieOptions(config));
}

/** Значение refresh-cookie из заголовка Cookie (cookie-parser не нужен). */
export function readRefreshCookie(req: Request): string | null {
    return readCookie(req.headers.cookie, CABINET_DEFAULTS.refreshCookieName);
}

export function readCookie(
    header: string | undefined,
    name: string,
): string | null {
    if (!header) return null;
    for (const part of header.split(';')) {
        const index = part.indexOf('=');
        if (index < 0) continue;
        if (part.slice(0, index).trim() !== name) continue;
        const raw = part.slice(index + 1).trim();
        try {
            return decodeURIComponent(raw) || null;
        } catch {
            return raw || null;
        }
    }
    return null;
}
