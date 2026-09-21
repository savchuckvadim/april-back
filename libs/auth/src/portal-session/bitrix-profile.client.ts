import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { BITRIX_PROFILE_TIMEOUT_MS } from './portal-session.const';

/** Профиль текущего пользователя портала (REST-метод `profile`). */
export interface BitrixProfile {
    id: string;
    name: string | null;
    lastName: string | null;
    isAdmin: boolean;
}

export type BitrixProfileResult =
    | { ok: true; profile: BitrixProfile }
    | { ok: false; error: string };

interface BitrixRestBody {
    result?: unknown;
    error?: string;
    error_description?: string;
}

/**
 * REST-проверка AUTH_ID фрейма: живой токен возвращает профиль текущего
 * пользователя портала (метод `profile`), просроченный или подделанный —
 * ошибку Битрикса. Заодно узнаём Bitrix-id и признак администратора.
 *
 * Клиент stateless: домен и токен приходят аргументами, состояния
 * per-portal нет — race condition между доменами исключён (CLAUDE.md).
 * Тот же приём, что у MarketplaceBxClient маркетплейса; без зависимости
 * от libs/bitrix, чтобы `@lib/auth` оставалась лёгкой.
 */
@Injectable()
export class BitrixProfileClient {
    private readonly logger = new Logger(BitrixProfileClient.name);

    async getProfile(
        domain: string,
        accessToken: string,
    ): Promise<BitrixProfileResult> {
        const url = `https://${domain}/rest/profile`;
        try {
            const response = await axios.post<BitrixRestBody>(
                url,
                { auth: accessToken },
                { timeout: BITRIX_PROFILE_TIMEOUT_MS },
            );
            return this.fromBody(domain, response.data);
        } catch (error) {
            // Битрикс отдаёт REST-ошибки (expired_token и т.п.) с HTTP 401 —
            // тело всё равно разбираем: это штатный отказ, не сбой сети.
            if (axios.isAxiosError(error) && error.response?.data) {
                return this.fromBody(
                    domain,
                    error.response.data as BitrixRestBody,
                );
            }
            const message =
                error instanceof Error ? error.message : String(error);
            this.logger.warn(`profile ${domain}: сеть/таймаут — ${message}`);
            return { ok: false, error: `NETWORK_ERROR: ${message}` };
        }
    }

    private fromBody(
        domain: string,
        body: BitrixRestBody,
    ): BitrixProfileResult {
        if (body.error) {
            this.logger.warn(
                `profile ${domain}: ${body.error} ${body.error_description ?? ''}`.trim(),
            );
            return { ok: false, error: body.error };
        }
        if (!body.result || typeof body.result !== 'object') {
            return { ok: false, error: 'EMPTY_RESULT' };
        }
        const raw = body.result as Record<string, unknown>;
        const id =
            typeof raw.ID === 'string'
                ? raw.ID
                : typeof raw.ID === 'number'
                  ? String(raw.ID)
                  : '';
        if (!id) return { ok: false, error: 'NO_USER_ID' };
        return {
            ok: true,
            profile: {
                id,
                name: stringOrNull(raw.NAME),
                lastName: stringOrNull(raw.LAST_NAME),
                isAdmin: raw.ADMIN === true || raw.ADMIN === 'true',
            },
        };
    }
}

function stringOrNull(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}
