import axios, { AxiosError, AxiosInstance } from 'axios';
import { Logger } from '@nestjs/common';
import * as http from 'http';
import * as https from 'https';
import {
    IBitrixV3Credentials,
    IBitrixV3RateLimiter,
} from '../interface/bitrix-v3-credentials.interface';
import { IBitrixV3Response } from '../interface/bitrix-v3-response.interface';
import { BitrixV3ApiError, isBitrixV3ErrorBody } from './bitrix-v3-api.error';
import { buildBitrixV3Url } from './bitrix-v3-url';
import { Semaphore } from './semaphore';

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_CONCURRENCY = 10;
const RETRY_503_DELAY_MS = 10000;
const RETRY_LIMIT_DELAY_MS = 35000;

/**
 * Транспорт REST 3.0: строит URL, шлёт JSON POST, разворачивает
 * единый формат ответа `{result, time}` и превращает ошибки
 * в типизированный BitrixV3ApiError. Ретраи: таймаут, 503, лимиты.
 */
export class BitrixV3CoreService {
    private readonly logger = new Logger(BitrixV3CoreService.name);
    private readonly http: AxiosInstance;
    private readonly semaphore: Semaphore;

    public readonly domain: string;

    constructor(
        private readonly credentials: IBitrixV3Credentials,
        private readonly rateLimiter: IBitrixV3RateLimiter | null = null,
        httpInstance?: AxiosInstance,
    ) {
        this.domain = credentials.domain;
        this.semaphore = new Semaphore(DEFAULT_CONCURRENCY);
        this.http =
            httpInstance ??
            axios.create({
                timeout: DEFAULT_TIMEOUT_MS,
                httpAgent: new http.Agent({ keepAlive: true }),
                httpsAgent: new https.Agent({ keepAlive: true }),
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
            });
    }

    /**
     * Вызов метода REST 3.0. Возвращает распакованный `result`.
     */
    async request<T>(
        method: string,
        params: Record<string, unknown>,
        retries = 2,
    ): Promise<T> {
        const url = buildBitrixV3Url(this.credentials, method);
        const body = this.credentials.webhook
            ? params
            : { ...params, auth: this.credentials.accessToken };

        if (this.rateLimiter) {
            await this.rateLimiter.acquire(this.domain);
        }
        await this.semaphore.acquire();
        try {
            const response = await this.http.post<IBitrixV3Response<T>>(
                url,
                body,
            );
            // Подстраховка: ошибка со статусом 200
            if (isBitrixV3ErrorBody(response.data)) {
                throw BitrixV3ApiError.fromBody(
                    method,
                    response.data,
                    response.status,
                );
            }
            return response.data.result;
        } catch (error) {
            return await this.handleError<T>(error, method, params, retries);
        } finally {
            this.semaphore.release();
        }
    }

    private async handleError<T>(
        error: unknown,
        method: string,
        params: Record<string, unknown>,
        retries: number,
    ): Promise<T> {
        const apiError = this.toApiError(error, method);

        if (apiError) {
            this.logger.error(
                `[${this.domain}] ${apiError.message}` +
                    (apiError.validation
                        ? ` | validation: ${JSON.stringify(apiError.validation)}`
                        : ''),
            );
            // Превышение квоты запросов — подождать и повторить
            if (apiError.code.includes('LIMIT') && retries > 0) {
                this.logger.warn(
                    `[${this.domain}] лимит запросов на ${method}, повтор через ${RETRY_LIMIT_DELAY_MS}мс`,
                );
                await this.sleep(RETRY_LIMIT_DELAY_MS);
                return this.request<T>(method, params, retries - 1);
            }
            throw apiError;
        }

        const axiosError = error as AxiosError;
        const message = axiosError?.message ?? 'Unknown error';
        const status = axiosError?.response?.status;
        this.logger.error(
            `[${this.domain}] Error calling Bitrix V3 [${method}]` +
                (status ? ` (HTTP ${status})` : '') +
                `: ${message}`,
        );

        const isTimeout =
            message.includes('timeout') || axiosError?.code === 'ECONNABORTED';
        if (isTimeout && retries > 0) {
            this.logger.warn(`[${this.domain}] таймаут ${method}, повтор...`);
            return this.request<T>(method, params, retries - 1);
        }

        if (status === 503 && retries > 0) {
            this.logger.warn(
                `[${this.domain}] 503 на ${method}, повтор через ${RETRY_503_DELAY_MS}мс`,
            );
            await this.sleep(RETRY_503_DELAY_MS);
            return this.request<T>(method, params, retries - 1);
        }

        throw error;
    }

    /**
     * Достаёт ошибку единого формата v3 из HTTP-ответа
     * (Битрикс отдаёт её с 4xx-статусом, axios бросает исключение).
     */
    private toApiError(
        error: unknown,
        method: string,
    ): BitrixV3ApiError | null {
        if (error instanceof BitrixV3ApiError) {
            return error;
        }
        const responseData = (error as AxiosError)?.response?.data;
        if (isBitrixV3ErrorBody(responseData)) {
            return BitrixV3ApiError.fromBody(
                method,
                responseData,
                (error as AxiosError).response?.status,
            );
        }
        return null;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
