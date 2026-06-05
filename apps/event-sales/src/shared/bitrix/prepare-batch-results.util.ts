import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';

export function prepareBatchResults<T>(
    results: IBitrixBatchResponseResult[],
): T[] {
    const entities: T[] = [];
    for (const chunk of results) {
        for (const key in chunk.result) {
            const entity = chunk.result[key] as T;
            entities.push(entity);
        }
    }
    return entities;
}
