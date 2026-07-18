import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

/**
 * Тонкий REST-клиент Битрикс24 для install-флоу маркетплейса.
 *
 * ВРЕМЕННОЕ решение (осознанно): методы event.bind/placement.* нужны
 * прямо в момент установки со свежим access_token из запроса, а типизация
 * доменов libs/bitrix (BITRIX_DOMAIN_MODULE_GUIDE) — отдельная задача
 * (план, этап 3). Клиент stateless: домен и токен передаются аргументами,
 * состояния per-portal нет — race condition между доменами исключён.
 * TODO(этап 3): перевести на типизированные домены libs/bitrix и удалить.
 */

export enum MarketplaceBxMethod {
    EVENT_BIND = 'event.bind',
    EVENT_UNBIND = 'event.unbind',
    EVENT_GET = 'event.get',
    PLACEMENT_BIND = 'placement.bind',
    PLACEMENT_UNBIND = 'placement.unbind',
    PLACEMENT_LIST = 'placement.list',
    APP_INFO = 'app.info',
    PROFILE = 'profile',
    USER_CURRENT = 'user.current',
}

/** Профиль текущего пользователя портала (REST-метод `profile`) */
export interface BxProfileResult {
    ok: boolean;
    id?: string;
    name?: string;
    lastName?: string;
    isAdmin: boolean;
    error?: string;
}

export interface MarketplaceBxCallResult {
    ok: boolean;
    result?: unknown;
    error?: string;
    errorDescription?: string;
}

/** Специфичные коды Битрикса «уже сделано» — при переустановке это успех */
const ALREADY_DONE_ERRORS = new Set([
    'ERROR_HANDLER_ALREADY_EXIST',
    'ERROR_PLACEMENT_HANDLER_ALREADY_EXIST',
]);

/**
 * Generic-код ERROR_CORE Битрикс использует и для «уже привязано»:
 * «Unable to set event handler: Handler already binded» (прод-лог
 * april-dev 2026-07-13, повторный event.bind при переустановке).
 * Распознаём по описанию, чтобы не глотать посторонние ERROR_CORE.
 */
const ALREADY_DONE_DESCRIPTION = /handler already bind/i;

@Injectable()
export class MarketplaceBxClient {
    private readonly logger = new Logger(MarketplaceBxClient.name);

    async call(
        domain: string,
        accessToken: string,
        method: MarketplaceBxMethod,
        params: Record<string, unknown>,
    ): Promise<MarketplaceBxCallResult> {
        const url = `https://${domain}/rest/${method}`;
        try {
            const response = await axios.post<{
                result?: unknown;
                error?: string;
                error_description?: string;
            }>(url, { ...params, auth: accessToken }, { timeout: 15000 });

            const data = response.data;
            if (data.error) {
                if (this.isAlreadyDone(data.error, data.error_description)) {
                    return { ok: true, result: 'already_done' };
                }
                return {
                    ok: false,
                    error: data.error,
                    errorDescription: data.error_description,
                };
            }
            return { ok: true, result: data.result };
        } catch (error) {
            // Битрикс отдаёт REST-ошибки с HTTP 4xx — достаём тело
            if (axios.isAxiosError(error) && error.response?.data) {
                const data = error.response.data as {
                    error?: string;
                    error_description?: string;
                };
                if (this.isAlreadyDone(data.error, data.error_description)) {
                    return { ok: true, result: 'already_done' };
                }
                this.logger.warn(
                    `BX ${method} failed: domain=${domain} error=${data.error ?? '-'} ${data.error_description ?? ''}`,
                );
                return {
                    ok: false,
                    error: data.error,
                    errorDescription: data.error_description,
                };
            }
            const message =
                error instanceof Error ? error.message : String(error);
            this.logger.warn(
                `BX ${method} failed: domain=${domain} ${message}`,
            );
            return {
                ok: false,
                error: 'NETWORK_ERROR',
                errorDescription: message,
            };
        }
    }

    /**
     * «Уже сделано» = успех (идемпотентность переустановки): либо
     * специфичный код, либо ERROR_CORE строго с «already bind» в описании.
     */
    private isAlreadyDone(error?: string, description?: string): boolean {
        if (!error) {
            return false;
        }
        if (ALREADY_DONE_ERRORS.has(error)) {
            return true;
        }
        return (
            error === 'ERROR_CORE' &&
            ALREADY_DONE_DESCRIPTION.test(description ?? '')
        );
    }

    /** event.bind (идемпотентность «уже привязано» обрабатывает call) */
    async bindEvent(
        domain: string,
        accessToken: string,
        event: string,
        handler: string,
    ): Promise<MarketplaceBxCallResult> {
        return this.call(domain, accessToken, MarketplaceBxMethod.EVENT_BIND, {
            event,
            handler,
        });
    }

    /** event.get — обработчики событий, зарегистрированные НАШИМ приложением */
    async listEvents(
        domain: string,
        accessToken: string,
    ): Promise<MarketplaceBxCallResult> {
        return this.call(
            domain,
            accessToken,
            MarketplaceBxMethod.EVENT_GET,
            {},
        );
    }

    /** event.unbind по паре (event, handler) */
    async unbindEvent(
        domain: string,
        accessToken: string,
        event: string,
        handler: string,
    ): Promise<MarketplaceBxCallResult> {
        return this.call(
            domain,
            accessToken,
            MarketplaceBxMethod.EVENT_UNBIND,
            { event, handler },
        );
    }

    /**
     * placement.list — текущие привязки НАШЕГО приложения на портале
     * (Битрикс возвращает только встройки, сделанные этим приложением).
     */
    async listPlacements(
        domain: string,
        accessToken: string,
    ): Promise<MarketplaceBxCallResult> {
        return this.call(
            domain,
            accessToken,
            MarketplaceBxMethod.PLACEMENT_LIST,
            {},
        );
    }

    /** placement.unbind по паре (PLACEMENT, HANDLER) */
    async unbindPlacement(
        domain: string,
        accessToken: string,
        placement: string,
        handler: string,
    ): Promise<MarketplaceBxCallResult> {
        return this.call(
            domain,
            accessToken,
            MarketplaceBxMethod.PLACEMENT_UNBIND,
            { PLACEMENT: placement, HANDLER: handler },
        );
    }

    /** placement.bind (идемпотентность «уже привязано» обрабатывает call) */
    async bindPlacement(
        domain: string,
        accessToken: string,
        placement: string,
        handler: string,
        title: string,
        description?: string,
    ): Promise<MarketplaceBxCallResult> {
        return this.call(
            domain,
            accessToken,
            MarketplaceBxMethod.PLACEMENT_BIND,
            {
                PLACEMENT: placement,
                HANDLER: handler,
                TITLE: title,
                DESCRIPTION: description ?? title,
            },
        );
    }

    /**
     * REST-верификация присланного AUTH_ID: живой токен вернёт профиль
     * текущего пользователя портала (метод `profile`), мёртвый/подделанный —
     * ошибку. Заодно узнаём, администратор ли пользователь.
     */
    async getProfile(
        domain: string,
        accessToken: string,
    ): Promise<BxProfileResult> {
        const response = await this.call(
            domain,
            accessToken,
            MarketplaceBxMethod.PROFILE,
            {},
        );
        if (
            !response.ok ||
            !response.result ||
            typeof response.result !== 'object'
        ) {
            return { ok: false, isAdmin: false, error: response.error };
        }
        const profile = response.result as Record<string, unknown>;
        return {
            ok: true,
            id: typeof profile.ID === 'string' ? profile.ID : undefined,
            name: typeof profile.NAME === 'string' ? profile.NAME : undefined,
            lastName:
                typeof profile.LAST_NAME === 'string'
                    ? profile.LAST_NAME
                    : undefined,
            isAdmin: profile.ADMIN === true || profile.ADMIN === 'true',
        };
    }

    /**
     * Email текущего пользователя (REST `user.current` — в отличие от
     * `profile` он возвращает EMAIL). Best-effort для предзаполнения
     * онбординг-формы; ошибка → undefined.
     */
    async getCurrentUserEmail(
        domain: string,
        accessToken: string,
    ): Promise<string | undefined> {
        const response = await this.call(
            domain,
            accessToken,
            MarketplaceBxMethod.USER_CURRENT,
            {},
        );
        if (
            !response.ok ||
            !response.result ||
            typeof response.result !== 'object'
        ) {
            return undefined;
        }
        const user = response.result as Record<string, unknown>;
        return typeof user.EMAIL === 'string' && user.EMAIL.length > 0
            ? user.EMAIL
            : undefined;
    }
}
