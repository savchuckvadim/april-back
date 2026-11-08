import { HttpService } from '@nestjs/axios';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { EgressProxyService } from '@lib/egress-proxy';

/** Хост Bot API — он должен быть в списке хостов исходящего прокси. */
export const TELEGRAM_API_HOST = 'api.telegram.org';
/** Лимит Telegram на длину сообщения. */
export const TELEGRAM_MAX_TEXT = 4096;
const TELEGRAM_TIMEOUT_MS = 15_000;

/** Чем ходить в Bot API: HTTP-клиент и исходящий прокси (с РФ-серверов напрямую нельзя). */
export interface TelegramBotApiTransport {
    http: HttpService;
    egress: EgressProxyService;
}

interface TelegramApiResponse<T> {
    ok: boolean;
    result?: T;
    description?: string;
}

/** Ошибка Bot API с текстом Telegram («Unauthorized», «chat not found»), без адреса с токеном. */
export class TelegramBotApiError extends Error {
    constructor(
        readonly method: string,
        description: string,
    ) {
        super(`${method}: ${description}`);
        this.name = 'TelegramBotApiError';
    }
}

/**
 * Вызов метода Bot API для любого бота April (тревоги, поддержка,
 * клиентский). Токен живёт только в адресе запроса и в текст ошибки не
 * попадает: наружу уходит TelegramBotApiError с описанием от Telegram.
 *
 * @throws TelegramBotApiError — сеть, HTTP-ошибка или ok=false
 */
export async function callTelegramBotApi<T = unknown>(
    transport: TelegramBotApiTransport,
    token: string,
    method: string,
    payload: Record<string, unknown>,
): Promise<T | undefined> {
    const route = transport.egress.route(
        `https://${TELEGRAM_API_HOST}/bot${token}/${method}`,
    );
    let data: TelegramApiResponse<T> | undefined;
    try {
        const response = await firstValueFrom(
            transport.http.post<TelegramApiResponse<T>>(route.url, payload, {
                timeout: TELEGRAM_TIMEOUT_MS,
                ...(route.viaProxy ? { headers: { ...route.headers } } : {}),
            }),
        );
        data = response.data;
    } catch (error) {
        throw new TelegramBotApiError(method, describeTelegramError(error));
    }
    if (!data?.ok) {
        throw new TelegramBotApiError(
            method,
            data?.description ?? 'Telegram ответил ok=false',
        );
    }
    return data.result;
}

/** Имя бота без @ по токену (getMe). @throws TelegramBotApiError */
export async function fetchTelegramBotUsername(
    transport: TelegramBotApiTransport,
    token: string,
): Promise<string | null> {
    const me = await callTelegramBotApi<{ username?: string }>(
        transport,
        token,
        'getMe',
        {},
    );
    return me?.username?.trim() || null;
}

function describeTelegramError(error: unknown): string {
    if (isAxiosError<TelegramApiResponse<unknown>>(error)) {
        return error.response?.data?.description ?? error.message;
    }
    return error instanceof Error ? error.message : String(error);
}
