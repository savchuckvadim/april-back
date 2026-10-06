import axios, { AxiosError, AxiosInstance, AxiosResponse } from 'axios';
import { Logger } from '@nestjs/common';
import { TelegramService } from '@lib/telegram/telegram.service';
import {
    benignBitrixErrorMarker,
    requestedEntityId,
} from './bitrix-benign-error.util';
import { BxAuthType } from './bx-auth-type.enum';
import { Semaphore } from './semaphor';
import { delay } from '@/shared/lib';
import { BitrixRateLimiterService } from '../rate-limit/bitrix-rate-limiter.service';
import type { BitrixRateLimitOverrides } from '../rate-limit/bitrix-rate-limiter.config';
import {
    BITRIX_CALL_CLASS,
    BitrixCallContext,
    getBitrixCallContext,
} from '../context/bitrix-call-context';
import {
    BITRIX_REQUEST_RESULT,
    BitrixRequestResult,
    observeBitrixRequest,
} from '../metrics/bitrix-metrics';
import {
    BITRIX_HTTPS_AGENT,
    BITRIX_HTTP_AGENT,
    BITRIX_REQUEST_PROFILES,
    BitrixRequestProfile,
    SLOW_BITRIX_REQUEST_MS,
    backgroundCooldownMs,
} from './bitrix-request-profile';
import {
    isBitrixQueryLimitExceeded,
    isBitrixTimeout,
    readBitrixTime,
} from './bitrix-response.util';

export class BitrixCore {
    public readonly logger = new Logger(BitrixCore.name);
    protected readonly axiosInstance: AxiosInstance;

    public domain = '';
    public apiKey = '';
    public token: string | null;
    public authType: BxAuthType;
    public semaphore: Semaphore;

    constructor(
        public readonly telegramBot: TelegramService,
        authType: BxAuthType,
        domain: string,
        token: string | null,
        apiKey: string = '',
        private readonly rateLimiter: BitrixRateLimiterService,
        // Лимит портала из его настроек (тариф, доля фона, ожидание).
        private readonly rateLimit?: BitrixRateLimitOverrides,
    ) {
        this.semaphore = new Semaphore(10);
        this.domain = domain;
        this.authType = authType;
        this.token = token;
        this.apiKey = apiKey;
        // Агенты общие на процесс (пул соединений), таймаут задаётся на
        // каждый запрос по классу вызова — см. bitrix-request-profile.
        this.axiosInstance = axios.create({
            httpAgent: BITRIX_HTTP_AGENT,
            httpsAgent: BITRIX_HTTPS_AGENT,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    protected getUrl(method: string): string {
        return this.authType === BxAuthType.TOKEN && this.token
            ? `https://${this.domain}/rest/${method}`
            : `https://${this.domain}/${this.apiKey}/${method}`;
    }

    protected async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Логировать ли тело ответа/запроса Bitrix при ошибке.
     * Включено по умолчанию; выключается переменной окружения
     * BITRIX_LOG_ERROR_PAYLOAD=false (или 0/off/no).
     */
    protected isErrorPayloadLogEnabled(): boolean {
        const flag = process.env.BITRIX_LOG_ERROR_PAYLOAD?.toLowerCase().trim();
        return !(
            flag === 'false' ||
            flag === '0' ||
            flag === 'off' ||
            flag === 'no'
        );
    }

    /**
     * Безопасно сериализует тело ответа/запроса Bitrix для логов
     * (обрезает длинные значения, не падает на циклических ссылках).
     */
    protected stringifyResponse(value: unknown): string {
        try {
            const text =
                typeof value === 'string' ? value : JSON.stringify(value);
            const MAX = 1000;
            return text && text.length > MAX
                ? `${text.slice(0, MAX)}…(truncated)`
                : (text ?? 'undefined');
        } catch {
            return '[unserializable]';
        }
    }

    /**
     * Одно обращение в Битрикс с повторами.
     *
     * Сроки и число повторов зависят от класса вызова (менеджер или фон —
     * см. bitrix-call-context и bitrix-request-profile); `retries` задаёт
     * число повторов явно, если вызывающему нужно своё.
     *
     * Каждая попытка заново проходит ограничитель и семафор. Слот семафора
     * освобождается ДО паузы перед повтором: раньше повтор вызывался
     * рекурсивно изнутри catch и держал 2–3 слота сразу, а десять
     * одновременных повторов на одном экземпляре блокировали друг друга.
     */
    public async request<T = any>(
        method: string,
        data: unknown,
        retries?: number,
    ): Promise<AxiosResponse<T>> {
        const url = this.getUrl(method);
        const context = getBitrixCallContext();
        const profile = BITRIX_REQUEST_PROFILES[context.callClass];
        let retriesLeft = retries ?? profile.retries;

        for (;;) {
            await this.rateLimiter.acquire(
                this.domain,
                context,
                this.rateLimit,
            );
            await this.semaphore.acquire();

            const startedAt = Date.now();
            let failure: unknown;
            let response: AxiosResponse<T> | null = null;
            try {
                response = await this.axiosInstance.post<T>(url, data, {
                    timeout: profile.timeoutMs,
                });
                this.observe(
                    method,
                    context,
                    BITRIX_REQUEST_RESULT.ok,
                    startedAt,
                    response.data,
                );
            } catch (error) {
                failure = error;
            } finally {
                this.semaphore.release();
            }

            if (response) {
                // Слот семафора уже свободен: пауза тяжёлого фона не держит
                // остальные запросы этого экземпляра.
                if (context.callClass === BITRIX_CALL_CLASS.background) {
                    const cooldown = backgroundCooldownMs(
                        readBitrixTime(response.data, 'processing'),
                    );
                    if (cooldown) await delay(cooldown);
                }
                return response;
            }

            this.observe(
                method,
                context,
                isBitrixTimeout(failure)
                    ? BITRIX_REQUEST_RESULT.timeout
                    : BITRIX_REQUEST_RESULT.error,
                startedAt,
            );
            this.reportError(failure, method, data);

            const pauseMs = this.resolveRetryPause(
                failure,
                method,
                retriesLeft,
                profile,
            );
            if (pauseMs === null) throw failure;

            retriesLeft -= 1;
            await delay(pauseMs);
        }
    }

    /**
     * Пауза перед повтором или null, если повторять нельзя.
     *
     * Повторяем три случая: таймаут, превышение лимита запросов и «сервис
     * недоступен» (503) — пока остались попытки. Остальные ошибки отдаём
     * вызывающему сразу.
     */
    protected resolveRetryPause(
        error: unknown,
        method: string,
        retriesLeft: number,
        profile: BitrixRequestProfile,
    ): number | null {
        if (retriesLeft <= 0) return null;

        if (isBitrixTimeout(error)) {
            this.logger.warn(
                `Timeout on ${method}, retrying in ` +
                    `${profile.timeoutPauseMs / 1000}s...`,
            );
            return profile.timeoutPauseMs;
        }

        if (isBitrixQueryLimitExceeded(error)) {
            this.logger.warn(
                `Bitrix query limit exceeded for ${method}, waiting ` +
                    `${profile.queryLimitPauseMs / 1000}s...`,
            );
            return profile.queryLimitPauseMs;
        }

        if ((error as AxiosError).response?.status === 503) {
            this.logger.warn(
                `Bitrix 503 Service Unavailable on ${method}, retrying in ` +
                    `${profile.busyPauseMs / 1000}s...`,
            );
            return profile.busyPauseMs;
        }

        return null;
    }

    /**
     * Лог и алерт об ошибке вызова.
     *
     * Алерт в Telegram НЕ ожидается: раньше `await` стоял прямо на пути
     * ошибки, и каждый сбой дополнительно ждал ответа телеграма (у его
     * клиента нет таймаута) — на каждую попытку и каждый упавший чанк.
     */
    protected reportError(error: unknown, method: string, data: unknown): void {
        const e = error as {
            message?: string;
            response?: { data?: unknown };
            toString?: () => string;
        };
        const message = e?.message ?? 'Unknown error';
        const responseText =
            e?.response?.data ?? e?.toString?.() ?? String(error);

        const status = (error as AxiosError).response?.status;
        const payload = this.isErrorPayloadLogEnabled()
            ? ` | response: ${this.stringifyResponse(responseText)}` +
              ` | request: ${this.stringifyResponse(data)}`
            : '';
        // Ожидаемые «ошибки», которые вызывающий код обрабатывает сам —
        // телеграм-алерт не шлём (логи остаются). Правило и его
        // обоснование — в bitrix-benign-error.util.ts.
        const responseJson = JSON.stringify(responseText ?? '');
        const benignMarker = benignBitrixErrorMarker(method, responseJson);
        if (benignMarker) {
            this.logger.warn(
                `Bitrix [${method}]: ${benignMarker} (id ${requestedEntityId(data)}) — ` +
                    'обрабатывается вызывающим кодом, без алерта',
            );
            return;
        }

        this.logger.error(
            `Error calling Bitrix [${method}]` +
                (status ? ` (HTTP ${status})` : '') +
                `: ${message}` +
                payload,
        );
        void Promise.resolve(
            this.telegramBot.sendMessageAdminError(
                `Bitrix API error (${method}): ${JSON.stringify(responseText)}`,
            ),
        ).catch(() => undefined);
    }

    /**
     * Учёт попытки: метрики всегда, предупреждение в лог — для медленных.
     *
     * Успешные одиночные вызовы раньше не оставляли следа вовсе, и фоновые
     * обходы были невидимы. Писать строку на КАЖДЫЙ вызов — утопить лог,
     * поэтому в лог идут только медленные, а счёт ведут метрики.
     */
    private observe(
        method: string,
        context: BitrixCallContext,
        result: BitrixRequestResult,
        startedAt: number,
        body?: unknown,
    ): void {
        const durationMs = Date.now() - startedAt;
        observeBitrixRequest({
            domain: this.domain,
            method,
            callClass: context.callClass,
            result,
            durationMs,
        });

        if (durationMs < SLOW_BITRIX_REQUEST_MS) return;
        const operating = readBitrixTime(body, 'operating');
        this.logger.warn(
            `Медленный вызов Bitrix [${method}] ${this.domain}: ` +
                `${(durationMs / 1000).toFixed(1)} с, ${result}, ` +
                `${context.callClass} (${context.source})` +
                (operating === null ? '' : `, operating ${operating} с`),
        );
    }
}
