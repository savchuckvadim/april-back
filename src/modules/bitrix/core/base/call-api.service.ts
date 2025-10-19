// services/call-api.service.ts
import { BXApiSchema, TBXRequest } from '..';
import { IBitrixResponse } from '../interface/bitrix-api-http.intterface';
import { TBXResponse } from '../domain';
import { EBxNamespace } from '../domain';
import { BitrixCore } from './bitrix-core.service';
import { AxiosInstance } from 'axios';

export class CallApiService {
    constructor(private readonly core: BitrixCore, private readonly http: AxiosInstance) { }

    /**
      * Универсальный метод вызова
      */
    async call<T = any>(method: string, data: Record<string, any>): Promise<T> {
        const response = await this.core.request<T>(method, data);
        return response.data;
    }

    /**
     * Типизированный метод вызова
     */
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
        let fullMethod = `${String(namespace)}.${String(entity)}.${String(method)}`;
        if (namespace === EBxNamespace.WITHOUT_NAMESPACE) {
            fullMethod = `${String(entity)}.${String(method)}`;
        }

        const response = await this.core.request<
            IBitrixResponse<TBXResponse<NAMESPACE, ENTITY, METHOD>>
        >(fullMethod, data);

        return response.data;
    }
}
