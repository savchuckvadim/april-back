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
    PLACEMENT_BIND = 'placement.bind',
    PLACEMENT_UNBIND = 'placement.unbind',
    PLACEMENT_LIST = 'placement.list',
    APP_INFO = 'app.info',
}

export interface MarketplaceBxCallResult {
    ok: boolean;
    result?: unknown;
    error?: string;
    errorDescription?: string;
}

/** Ошибки Битрикса, означающие «уже сделано» — при переустановке это успех */
const ALREADY_DONE_ERRORS = new Set([
    'ERROR_HANDLER_ALREADY_EXIST',
    'ERROR_PLACEMENT_HANDLER_ALREADY_EXIST',
]);

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
                if (data.error && ALREADY_DONE_ERRORS.has(data.error)) {
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

    /** event.bind с идемпотентностью (повторный bind = успех) */
    async bindEvent(
        domain: string,
        accessToken: string,
        event: string,
        handler: string,
    ): Promise<MarketplaceBxCallResult> {
        const result = await this.call(
            domain,
            accessToken,
            MarketplaceBxMethod.EVENT_BIND,
            { event, handler },
        );
        if (
            !result.ok &&
            result.error &&
            ALREADY_DONE_ERRORS.has(result.error)
        ) {
            return { ok: true, result: 'already_done' };
        }
        return result;
    }

    /** placement.bind (повторный bind того же HANDLER = успех) */
    async bindPlacement(
        domain: string,
        accessToken: string,
        placement: string,
        handler: string,
        title: string,
        description?: string,
    ): Promise<MarketplaceBxCallResult> {
        const result = await this.call(
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
        if (
            !result.ok &&
            result.error &&
            ALREADY_DONE_ERRORS.has(result.error)
        ) {
            return { ok: true, result: 'already_done' };
        }
        return result;
    }
}
