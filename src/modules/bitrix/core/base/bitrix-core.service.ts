import axios, { AxiosInstance, AxiosResponse, } from 'axios';
import { Logger } from '@nestjs/common';
import * as http from 'http';
import * as https from 'https';
import { TelegramService } from '../../../telegram/telegram.service';
import { BxAuthType } from '../../bitrix-service.factory';
import { Semaphore } from './semaphor';
import { delay } from '@/lib';

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
        apiKey: string = ''
    ) {
        this.semaphore = new Semaphore(10);
        this.domain = domain;
        this.authType = authType;
        this.token = token;
        this.apiKey = apiKey;
        this.axiosInstance = axios.create({
            timeout: 300000,
            httpAgent: new http.Agent({ keepAlive: true }),
            httpsAgent: new https.Agent({ keepAlive: true }),
            headers: { 'Content-Type': 'application/json' },
        });
    }

    protected getUrl(method: string): string {
        return this.authType === BxAuthType.TOKEN && this.token
            ? `https://${this.domain}/rest/${method}`
            : `https://${this.domain}/${this.apiKey}/${method}`

    }

    // init(domain: string, apiKey: string): void {
    //     this.domain = domain;
    //     this.apiKey = apiKey;
    //     this.logger.log(`Initialized Bitrix API for ${domain}`);
    // }

    protected async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    public async request<T = any>(
        method: string,
        data: any,
        retries = 2,
    ): Promise<AxiosResponse<T>> {
        const url = this.getUrl(method);
        await this.semaphore.acquire();

        try {
            const response = await this.axiosInstance.post<T>(url, data);
            return response;
        } catch (error) {
            return await this.handleError<T>(error, method, data, retries);
        } finally {
            this.semaphore.release();
        }
    }

    /**
     * Обработка ошибок таймаута и Bitrix ошибок
     */
    protected async handleError<T>(
        error: any,
        method: string,
        data: any,
        retries: number,
    ): Promise<AxiosResponse<T>> {
        const message = error?.message || 'Unknown error';
        const responseText = error?.response?.data || error?.toString();

        this.logger.error(`Error calling Bitrix [${method}]: ${message}`);
        await this.telegramBot.sendMessageAdminError(
            `Bitrix API error (${method}): ${JSON.stringify(responseText)}`,
        );

        // Retry для таймаута
        if (
            (message.includes('timeout') || error.code === 'ECONNABORTED')
            && retries > 0
        ) {
            this.logger.warn(`Timeout on ${method}, retrying in 3s...`);
            await delay(30000);
            return this.request<T>(method, data, retries - 1);
        }

        // Ошибка квоты Bitrix
        if (typeof responseText === 'string' && responseText.includes('QUERY_LIMIT_EXCEEDED')) {
            this.logger.warn(`Bitrix query limit exceeded for ${method}, waiting...`);
            await new Promise(res => setTimeout(res, 1000));
            return this.request<T>(method, data, retries - 1);
        }

        throw error;
    }
}
