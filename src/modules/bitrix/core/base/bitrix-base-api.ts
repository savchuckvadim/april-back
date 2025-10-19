// bitrix-base-api.ts
import { BitrixCore } from './bitrix-core.service';

import axios from 'axios';
import { TelegramService } from '@/modules/telegram/telegram.service';
import { BxAuthType } from '../../bitrix-service.factory';
import { CallApiService } from './call-api.service';
import { BatchApiService } from './batch-api.service';
import { BXApiSchema, TBXRequest, TBXResponse } from '../domain';
import { IBitrixBatchResponseResult, IBitrixResponse } from '../interface/bitrix-api-http.intterface';
import { IPortal } from '@/modules/portal/interfaces/portal.interface';

export class BitrixBaseApi {
    private readonly core: BitrixCore;
    private readonly callApi: CallApiService;
    private readonly batchApi: BatchApiService;
    public readonly domain: string;
    // private readonly apiKey: string;
    // private readonly token: string | null;
    // private readonly authType: BxAuthType;
    constructor(
        telegramBot: TelegramService,
        domain: string,
        apiKey: string,
        token: string | null,
        authType: BxAuthType
    ) {
        const http = axios.create({ timeout: 25000 });
        this.core = new BitrixCore(telegramBot, authType,domain, token, apiKey);
        this.callApi = new CallApiService(this.core, http);
        this.batchApi = new BatchApiService(this.core, http);
        this.domain = domain;
        // this.apiKey = apiKey;
        // this.token = token;
        // this.authType = authType;
    }
    init(portal: IPortal) {
        console.log('init new BitrixBaseApi');
    }
    // Обертки для удобства:
    async call<T>(method: string, data: Record<string, any>): Promise<any> {
        return await this.callApi.call(method, data);
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
        return await this.callApi.callType(namespace, entity, method, data);
    }

    async callBatch() {
        return await this.batchApi.callBatch();
    }

    async callBatchAsync() {
        return await this.batchApi.callBatchAsync();
    }

    async callBatchWithConcurrency(limit: number = 1) {
        return await this.batchApi.callBatchWithConcurrency(limit);
    }

    addCmdBatch(cmd: string, method: string, query: Record<string, any>) {
        return this.batchApi.addCmdBatch(cmd, method, query);
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
        return this.batchApi.addCmdBatchType(cmd, namespace, entity, method, data);
    }

    getCmdBatch(): Record<string, string> {
        return this.batchApi.getCmdBatch();
    }

    clearResult(result: IBitrixBatchResponseResult[]) {
        return this.batchApi.clearResult(result);
    }

}
