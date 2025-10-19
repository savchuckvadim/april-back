// services/batch-api.service.ts
import { BXApiSchema, EBxNamespace, TBXRequest } from '..';
import { IBitrixBatchResponse, IBitrixBatchResponseResult } from '../interface/bitrix-api-http.intterface';
import { BitrixCore } from './bitrix-core.service';
import { AxiosInstance } from 'axios';

export class BatchApiService {
    private cmdBatch: Record<string, string> = {};
    constructor(private readonly core: BitrixCore, private readonly http: AxiosInstance) {
        this.cmdBatch = {};
    }

    protected dictToQueryString(
        method: string,
        data: Record<string, any>,
    ): string {
        // this.logger.log(`Converting data to query string for method: ${method}`);
        const queryParts: string[] = [];

        const processItem = (key: string, value: any) => {
            key = key.trim();
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                for (const [subKey, subValue] of Object.entries(value)) {
                    processItem(`${key}[${subKey.trim()}]`, subValue);
                }
            } else if (Array.isArray(value)) {
                value.forEach((item, index) => {
                    if (typeof item === 'object') {
                        for (const [subKey, subValue] of Object.entries(item)) {
                            processItem(
                                `${key}[${index}][${subKey.trim()}]`,
                                subValue,
                            );
                        }
                    } else {
                        queryParts.push(`${key}[]=${item}`);
                    }
                });
            } else {
                queryParts.push(`${key}=${value}`);
            }
        };

        for (const [key, value] of Object.entries(data)) {
            processItem(key, value);
        }

        const queryString = `${method}?${queryParts.join('&')}`;
        // this.logger.log(`Generated query string: ${queryString}`);
        return queryString;
    }

    addCmdBatch(cmd: string, method: string, query: Record<string, any>) {

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

            // const url = `https://${this.domain}/${this.apiKey}/batch`;
            try {
                // this.logger.log(`Making batch request to: ${url}`);
                // const response: AxiosResponse<any> = await firstValueFrom(
                //     this.httpService.post(url, batchPayload, this.axiosOptions),
                // );
                const response = await this.core.request<any>('batch', batchPayload);
                // this.logger.log(`Batch request successful: ${JSON.stringify(response.data)}`);
                results.push(response.data.result);
                await this.sleep(100);
            } catch (error) {
                this.core.logger.error(`Batch request failed: ${error.message}`);
                await this.core.telegramBot.sendMessageAdminError(`Batch error:
          callBatch
          ${this.core.domain}

          ${JSON.stringify(error?.message)}`);
                results.push(error);
            }
        }

        this.cmdBatch = {};
        return results;
    }

    async callBatchAsync(): Promise<IBitrixBatchResponseResult[]> {
        this.core.logger.log('Calling batch async');
        const commands = Object.entries(this.cmdBatch);
        // this.logger.log(`Number of commands: ${commands.length}`);
        // this.logger.log(`Domain: ${this.domain}`);
        // this.logger.log(`Commands: ${JSON.stringify(commands)}`);
        const tasks: Promise<any>[] = [];

        for (let i = 0; i < commands.length; i += 50) {
            const batch = commands.slice(i, i + 50);
            tasks.push(this.executeBatch(batch));
        }
        this.core.logger.log(`length of tasks: ${tasks.length}`);

        const results = await Promise.all(tasks);
        this.cmdBatch = {};
        return results;
    }
    async callBatchWithConcurrency(
        limit = 3,
    ): Promise<IBitrixBatchResponseResult[]> {
        this.core.logger.log('Calling batch async with concurrency limit:', limit);

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
                    this.core.logger.warn(`Skipping failed batch at index ${start}`);
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

    protected async executeBatch(batch: [string, string][]) {
        // this.logger.log(`Executing batch of ${batch.length} commands`);
        const cmd: Record<string, string> = {};
        for (const [key, val] of batch) {
            cmd[key] = val;
        }

        const payload = { halt: 0, cmd };
        // const url = `https://${this.domain}/${this.apiKey}/batch`;

        try {
            this.core.logger.log(`Making batch request to: ${this.core.domain}`);
            // const response = (await firstValueFrom(
            //     this.httpService.post(url, payload, this.axiosOptions),
            // )) as AxiosResponse<IBitrixBatchResponse>;
            const response = await this.core.request<IBitrixBatchResponse>('batch', payload);
            const result = response.data.result as IBitrixBatchResponseResult;
            // this.logger.log(`Batch request successful: ${JSON.stringify(result)}`);
            // this.logger.log(`Domain: ${this.domain}`);
            const batchResultsCount = Object.keys(result.result).length;
            this.core.logger.log(`Batch results count: ${batchResultsCount}`);
            await this.handleBatchErrors(result, 'executeBatch');
            return result;
        } catch (error) {
            const msg = error?.response?.data || error;
            // this.logger.error(`Execute batch failed: ${JSON.stringify(msg)}`);
            await this.core.telegramBot.sendMessageAdminError(
                `Execute batch failed: ${JSON.stringify(error)}`,
            );
            return error;
        }
    }
    clearResult(result: IBitrixBatchResponseResult[]) {
        const results = [] as any[];
        result.map(res => {
            if (Object.keys(res.result).length > 0) {
                for (const key in res.result) {
                    results.push(res.result[key]);
                }
            }
        });
        return results;
    }
    protected async handleBatchErrors(
        result: IBitrixBatchResponseResult,
        context = 'Batch error',
    ): Promise<void> {
        if (!result?.result_error) return;
        this.core.logger.log(`
      success
      Domain:
      ${this.core.domain}
      `);

        const errorEntries = Object.entries(result.result_error);
        for (const [key, error] of errorEntries) {
            const message = `[${context}] Ошибка в ${key}: ${JSON.stringify(error)}

      Domain: ${this.core.domain}
      `;
            this.core.logger.log(`result_error: ${message}`);
            await this.core.telegramBot.sendMessageAdminError(message);
        }
    }

    protected async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }


}
