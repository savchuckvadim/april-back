import { BitrixV3CoreService } from './bitrix-v3-core.service';
import {
    BxV3ListMethod,
    BxV3Method,
    TBxV3Items,
    TBxV3Request,
    TBxV3Response,
} from '../schema/bx-v3-method-map';
import { IBitrixV3Pagination } from '../interface/bitrix-v3-response.interface';

const MAX_PAGE_LIMIT = 200;
const MAX_PAGES_SAFEGUARD = 500;

/**
 * Типизированный вызов методов REST 3.0.
 * Метод задаётся строкой-литералом из BxV3MethodMap —
 * типы запроса и ответа выводятся автоматически.
 */
export class CallV3ApiService {
    constructor(private readonly transport: BitrixV3CoreService) {}

    get domain(): string {
        return this.transport.domain;
    }

    /** Вызов известного (типизированного) метода */
    async call<M extends BxV3Method>(
        method: M,
        params: TBxV3Request<M>,
    ): Promise<TBxV3Response<M>> {
        return await this.transport.request<TBxV3Response<M>>(
            method,
            params as Record<string, unknown>,
        );
    }

    /**
     * Вызов метода, которого ещё нет в BxV3MethodMap.
     * Использовать только временно — затем описать метод в схеме домена.
     */
    async callRaw<T = unknown>(
        method: string,
        params: Record<string, unknown>,
    ): Promise<T> {
        return await this.transport.request<T>(method, params);
    }

    /**
     * Выкачивает ВСЕ элементы списочного метода, крутя pagination
     * до последней страницы (максимум страницы — 200 записей).
     */
    async callAll<M extends BxV3ListMethod>(
        method: M,
        params: TBxV3Request<M>,
        limit: number = MAX_PAGE_LIMIT,
    ): Promise<TBxV3Items<M>> {
        const all: unknown[] = [];

        for (let page = 1; page <= MAX_PAGES_SAFEGUARD; page++) {
            const pagination: IBitrixV3Pagination = { page, limit };
            const response = await this.call(method, {
                ...params,
                pagination,
            });
            const items = (response as { items: unknown[] }).items;
            all.push(...items);
            if (items.length < limit) {
                break;
            }
        }

        return all as TBxV3Items<M>;
    }
}
