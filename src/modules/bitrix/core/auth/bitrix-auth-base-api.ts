import { Logger } from '@nestjs/common';

import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as https from 'https';
import * as http from 'http';
import { TelegramService } from '../../../telegram/telegram.service';
import { AxiosResponse } from 'axios';
import {
    IBitrixBatchResponseResult,
    IBitrixResponse,
} from '../interface/bitrix-api-http.intterface';
import { IPortal } from 'src/modules/portal/interfaces/portal.interface';
import { BXApiSchema, EBxNamespace, TBXRequest, TBXResponse } from '../domain';
import { BitrixAppService } from '../../../bitrix-setup/app/services/bitrix-app.service';
import { BitrixAuthService } from './bitrix-auth.service';
import { BitrixBaseApi } from '..';
import { BITRIX_APP_CODES } from 'src/modules/bitrix-setup/app/enums/bitrix-app.enum';

export class BitrixAuthBaseApi extends BitrixBaseApi {
    protected readonly logger = new Logger(BitrixAuthBaseApi.name);
    public domain: string;


    private token: string;
    // protected appService: BitrixAppService;
    // protected authService: BitrixAuthService;
    constructor(
        telegramBot: TelegramService,
        httpService: HttpService,
        private appService: BitrixAppService,
        private authService: BitrixAuthService,
    ) {
        super(telegramBot, httpService);
        this.logger.log('BitrixBaseApi initialized');
        this.domain = '';
        // this.apiKey = '';
        // this.semaphore = new Semaphore(10);
        this.axiosOptions = {
            timeout: 25000,
            httpAgent: new http.Agent({ keepAlive: true }),
            httpsAgent: new https.Agent({ keepAlive: true }),
        };
    }



    async init(portal: IPortal): Promise<void> {
        this.logger.log(`Initializing BitrixApi from portal: ${portal.domain}`);
        this.domain = portal.domain;

        // this.apiKey = portal.key;
        this.cmdBatch = {};
        this.token = await this.getFreshToken(this.domain);

    }

    private async getFreshToken(domain: string): Promise<string> {
        const app = await this.appService.getApp({
            domain,
            code: BITRIX_APP_CODES.SALES,
        });
        if (!app) {
            throw new Error(`Bitrix app not installed for domain: ${domain}`);
        }

        let { access_token, expires_at } = app.bitrix_tokens || {};
        if (!access_token || !expires_at) {
            throw new Error(`Bitrix token not found for domain: ${domain}`);
        }

        // 1️⃣ Проверяем срок жизни токена
        const expiresAt = new Date(expires_at).getTime();
        const now = Date.now();
        const threeHours = 3 * 60 * 60 * 1000;
        const diff = expiresAt - now
        const isExpired = diff < threeHours

        if (isExpired) {
            console.log(`[Bitrix] Token for ${domain} expires soon → refreshing...`);
            const newToken = await this.authService.refreshToken(this.domain);
            access_token = newToken.access_token;
        }
        return access_token || '';

    }



    addCmdBatch(cmd: string, method: string, query: Record<string, any>) {
        // this.logger.log(`Adding command to batch: ${cmd}`);
        // this.logger.log(`Method: ${method}`);
        // this.logger.log(`Query: ${JSON.stringify(query)}`);
        // this.logger.log(`Domain: ${this.domain}`);
        const url = this.dictToQueryString(method, query);
        if (!this.cmdBatch[cmd]) {
            this.cmdBatch[cmd] = url;
        }
    }

    addCmdBatchType<
        NAMESPACE extends keyof BXApiSchema,
        ENTITY extends keyof BXApiSchema[NAMESPACE],
        METHOD extends keyof BXApiSchema[NAMESPACE][ENTITY],
    >(
        cmd: string,
        namespace: NAMESPACE,
        entity: ENTITY,
        method: METHOD,
        data: TBXRequest<NAMESPACE, ENTITY, METHOD>,
    ) {
        let resultMethod = `${String(namespace)}.${String(entity)}.${String(method)}`;
        if (namespace === EBxNamespace.WITHOUT_NAMESPACE) {
            resultMethod = `${String(entity)}.${String(method)}`;
        }

        // Transform data to a plain object if necessary
        const plainData = { ...data } as Record<string, any>;

        const url = this.dictToQueryString(resultMethod, plainData);
        if (!this.cmdBatch[cmd]) {
            this.cmdBatch[cmd] = url;
        }
    }

    getCmdBatch(): Record<string, string> {
        return this.cmdBatch;
    }

    async call<T>(method: string, data: Record<string, any>): Promise<any> {
        this.logger.log(`Making API call to method: ${method}`);
        this.logger.log(`Data: ${JSON.stringify(data)}`);
        // const url = `https://${this.domain}/${this.apiKey}/${method}`;

        const url = `https://${this.domain}/rest/${method}`;

        try {
            const response = await firstValueFrom(
                this.httpService.post(url, { ...data, auth: this.token }, this.axiosOptions),
            );
            this.logger.log(
                `API call successful: ${JSON.stringify(response.data)}`,
            );
            return response.data;
        } catch (error) {
            this.logger.error(`API call failed: ${error.message}`);
            await this.telegramBot.sendMessageAdminError(
                `Bitrix call error: ${JSON.stringify(error?.response?.data || error)}`,
            );
            throw error;
        }
    }


    async callType<
        NAMESPACE extends keyof BXApiSchema,
        ENTITY extends keyof BXApiSchema[NAMESPACE],
        METHOD extends keyof BXApiSchema[NAMESPACE][ENTITY],
    >(
        namespace: NAMESPACE,
        entity: ENTITY,
        method: METHOD,
        data: TBXRequest<NAMESPACE, ENTITY, METHOD>,
    ): Promise<IBitrixResponse<TBXResponse<NAMESPACE, ENTITY, METHOD>>> {
        this.logger.log(`Making API call to method: ${String(method)}`);

        let resultMethod = `${String(namespace)}.${String(entity)}.${String(method)}`;
        if (namespace === EBxNamespace.WITHOUT_NAMESPACE) {
            resultMethod = `${String(entity)}.${String(method)}`;
        }

        const url = `https://${this.domain}/rest/${resultMethod}`;

        try {
            const response = (await firstValueFrom(
                this.httpService.post(url, { data, auth: this.token }, this.axiosOptions),
            )) as AxiosResponse<
                IBitrixResponse<TBXResponse<NAMESPACE, ENTITY, METHOD>>
            >;
            this.logger.log(
                `API call successful: ${JSON.stringify(resultMethod)}`,
            );

            return response.data;
        } catch (error) {
            this.logger.error(`API call failed: ${error.message}`);
            await this.telegramBot.sendMessageAdminError(
                `Bitrix call error: ${JSON.stringify(error?.response?.data || error)}`,
            );
            throw error;
        }
    }

    async callBatch(): Promise<any[]> {
        // this.logger.log('Calling batch');
        // this.logger.log(`Domain: ${this.domain}`);

        const results = [] as string[];
        const commands = Object.entries(this.cmdBatch);
        // this.logger.log(`Number of commands: ${commands.length}`);

        for (let i = 0; i < commands.length; i += 50) {
            const batch = commands.slice(i, i + 50);
            const cmd: Record<string, string> = {};
            for (const [key, val] of batch) {
                cmd[key] = val;
            }

            const batchPayload = {
                halt: 0,
                cmd,
            };
            if (!this.domain || !this.token) {
                this.logger.error('Domain or API key is not set');
                await this.telegramBot.sendMessageAdminError(`
          BitrixBaseApi
          callBatch
          Domain or API key is not set
          `);
            }
            const url = `https://${this.domain}/rest/${this.token}/batch`;
            try {
                // this.logger.log(`Making batch request to: ${url}`);
                const response: AxiosResponse<any> = await firstValueFrom(
                    this.httpService.post(url, { ...batchPayload, auth: this.token }, this.axiosOptions),
                );
                // this.logger.log(`Batch request successful: ${JSON.stringify(response.data)}`);
                results.push(response.data.result);
                await this.sleep(100);
            } catch (error) {
                this.logger.error(`Batch request failed: ${error.message}`);
                await this.telegramBot.sendMessageAdminError(`Batch error:
          callBatch
          ${this.domain}

          ${JSON.stringify(error?.message)}`);
                results.push(error);
            }
        }

        this.cmdBatch = {};
        return results;
    }

    async callBatchAsync(): Promise<IBitrixBatchResponseResult[]> {
        this.logger.log('Calling batch async');
        const commands = Object.entries(this.cmdBatch);
        // this.logger.log(`Number of commands: ${commands.length}`);
        // this.logger.log(`Domain: ${this.domain}`);
        // this.logger.log(`Commands: ${JSON.stringify(commands)}`);
        const tasks: Promise<any>[] = [];

        for (let i = 0; i < commands.length; i += 50) {
            const batch = commands.slice(i, i + 50);
            tasks.push(this.executeBatch(batch));
        }
        this.logger.log(`length of tasks: ${tasks.length}`);

        const results = await Promise.all(tasks);
        this.cmdBatch = {};
        return results;
    }
    async callBatchWithConcurrency(
        limit = 3,
    ): Promise<IBitrixBatchResponseResult[]> {
        this.logger.log('Calling batch async with concurrency limit:', limit);

        const commands = Object.entries(this.cmdBatch);
        const results: IBitrixBatchResponseResult[] = [];

        let index = 0;

        const runBatch = async (): Promise<void> => {
            while (index < commands.length) {
                const start = index;
                index += 50;
                const batch = commands.slice(start, index);
                const result = await this.executeBatch(batch);

                if (
                    result &&
                    typeof result === 'object' &&
                    'result' in result
                ) {
                    results.push(result);
                } else {
                    this.logger.warn(`Skipping failed batch at index ${start}`);
                }
                // 💤 Задержка между вызовами
                await this.sleep(100);
            }
        };

        // Запускаем до `limit` параллельных воркеров
        await Promise.all(
            Array(limit)
                .fill(0)
                .map(() => runBatch()),
        );

        this.cmdBatch = {};
        return results;
    }






    // clearResult(result: IBitrixBatchResponseResult[]) {
    //     const results = [] as any[];
    //     result.map(res => {
    //         if (Object.keys(res.result).length > 0) {
    //             for (const key in res.result) {
    //                 results.push(res.result[key]);
    //             }
    //         }
    //     });
    //     return results;
    // }



}

// Вспомогательный семафор
class Semaphore {
    private semaphore: number;
    private waiting: Array<() => void> = [];

    constructor(count: number) {
        this.semaphore = count;
    }

    async acquire(): Promise<void> {
        if (this.semaphore > 0) {
            this.semaphore -= 1;
        } else {
            await new Promise<void>(resolve => this.waiting.push(resolve));
        }
    }

    release(): void {
        this.semaphore += 1;
        if (this.waiting.length > 0) {
            const next = this.waiting.shift();
            next?.();
        }
    }
}
