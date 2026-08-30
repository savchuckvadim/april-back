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

/**
 * Результат КОНКРЕТНОЙ batch-команды по её ключу; `undefined` — команды с
 * таким ключом в ответе нет.
 *
 * Почему обход всех чанков: батч режется по 50 команд, ответ приходит массивом
 * чанков, и нужная команда может оказаться в любом из них — позиция зависит от
 * того, сколько команд накопилось до неё. Искать в `results[0]` нельзя.
 *
 * Почему проверка `chunk.result`: у упавшего чанка поля `result` может не быть
 * вовсе (не-strict режим такие чанки молча пропускает, не бросая), а по типу
 * оно обязательное — значит, на рантайме страхуемся сами, иначе чтение id
 * роняло бы весь отчёт из-за одной сбойной пачки.
 */
export function findBatchResult<T>(
    results: IBitrixBatchResponseResult[],
    cmdKey: string,
): T | undefined {
    for (const chunk of results) {
        const chunkResult = chunk?.result;
        if (!chunkResult) continue;
        if (!Object.prototype.hasOwnProperty.call(chunkResult, cmdKey)) {
            continue;
        }
        return chunkResult[cmdKey] as T;
    }
    return undefined;
}
