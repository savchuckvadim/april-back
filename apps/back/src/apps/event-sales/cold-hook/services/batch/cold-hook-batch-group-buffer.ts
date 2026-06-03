/**
 * Накапливает batch-команды Bitrix группами (одна группа = команды одной компании).
 *
 * Зачем: внутри одного HTTP-batch (≤50 команд) работает $result[cmdKey].
 * Если зависимые команды одной группы попадут в разные чанки 50/50, ссылки
 * на $result[...] сломаются. Этот буфер гарантирует, что вся группа уходит в
 * один HTTP-вызов.
 *
 * Контракт:
 *  1. queue(fn) — регистрирует отложенный enqueue (саму команду в bitrix.batch
 *     добавит вызов fn, происходящий уже внутри endGroup).
 *  2. endGroup() — атомарно коммитит текущую группу: если она не помещается в
 *     остаток 50-чанка, сначала вызывается flush().
 *  3. flush() — отправляет накопленный буфер одним HTTP-вызовом
 *     (callBatchWithConcurrency(1) при буфере ≤50 = ровно 1 запрос).
 *  4. По завершении пройдите по getResults() для агрегированных ответов.
 *
 * Размер группы заранее знать не нужно. Жёсткое требование: размер одной
 * группы ≤ CHUNK_LIMIT, иначе её невозможно отправить атомарно.
 *
 * Класс не @Injectable — создаётся через new в use-case/handler.
 */
import { BitrixService } from '@/modules/bitrix';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';

type QueuedCommand = () => void;

export class ColdHookBatchGroupBuffer {
    private static readonly CHUNK_LIMIT = 50;

    private currentGroup: QueuedCommand[] = [];
    private bufferSize = 0;
    private readonly results: IBitrixBatchResponseResult[] = [];

    constructor(private readonly bitrix: BitrixService) {}

    /**
     * Регистрирует команду текущей группы. Сам enqueue (bitrix.batch.*) будет
     * вызван внутри endGroup — это позволяет атомарно решить, нужно ли сначала
     * flush'нуть буфер.
     */
    queue(enqueue: QueuedCommand): void {
        this.currentGroup.push(enqueue);
    }

    /**
     * Сколько команд уже зарегистрировано в текущей (ещё не закоммиченной) группе.
     */
    getCurrentGroupSize(): number {
        return this.currentGroup.length;
    }

    /**
     * Сколько команд накоплено в буфере (ждут flush).
     */
    getBufferSize(): number {
        return this.bufferSize;
    }

    /**
     * Атомарно коммитит текущую группу в буфер. Если буфер + группа не
     * помещаются в один чанк — сначала flush'ит существующий буфер.
     */
    async endGroup(): Promise<void> {
        const groupSize = this.currentGroup.length;
        if (groupSize === 0) {
            return;
        }
        if (groupSize > ColdHookBatchGroupBuffer.CHUNK_LIMIT) {
            throw new Error(
                `Group size ${groupSize} exceeds batch limit ${ColdHookBatchGroupBuffer.CHUNK_LIMIT}; ` +
                    `атомарная отправка невозможна.`,
            );
        }

        if (
            this.bufferSize + groupSize >
            ColdHookBatchGroupBuffer.CHUNK_LIMIT
        ) {
            await this.flush();
        }

        for (const enqueue of this.currentGroup) {
            enqueue();
        }
        this.bufferSize += groupSize;
        this.currentGroup = [];
    }

    /**
     * Отправляет накопленный буфер одним HTTP-batch-запросом. Очищает буфер.
     * Если буфер пуст — no-op.
     */
    async flush(): Promise<void> {
        if (this.bufferSize === 0) {
            return;
        }
        const res = await this.bitrix.api.callBatchWithConcurrency(1);
        this.results.push(...res);
        this.bufferSize = 0;
    }

    /**
     * Аггрегированные результаты всех уже отправленных flush'ей в порядке отправки.
     */
    getResults(): IBitrixBatchResponseResult[] {
        return this.results;
    }
}
