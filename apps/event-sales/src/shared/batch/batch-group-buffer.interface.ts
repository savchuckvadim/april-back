import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';

/**
 * Структурный контракт группового batch-буфера (см. ai/rules/bitrix-batch-grouping.md).
 *
 * Новый код (sales-hooks и далее) зависит от этого интерфейса, а не от
 * конкретного класса в cold-hook — когда буфер переедет при рефакторинге
 * cold, поменяется одна строка re-export'а в ./index.ts.
 */
export interface IBatchGroupBuffer {
    /** Регистрирует ОТЛОЖЕННЫЙ enqueue; реальный bitrix.batch.* уйдёт в endGroup(). */
    queue(enqueue: () => void): void;
    /** Атомарный коммит текущей группы: вся группа попадает в один HTTP-batch. */
    endGroup(): Promise<void>;
    /** Отправка накопленного буфера. */
    flush(): Promise<void>;
    getResults(): IBitrixBatchResponseResult[];
    getCurrentGroupSize(): number;
    getBufferSize(): number;
}
