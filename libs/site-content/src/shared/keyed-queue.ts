/**
 * Очередь задач по ключу: задачи с одним ключом идут строго по одной, с
 * разными — параллельно. Тот же приём, что у мест кадров в SiteMediaService:
 * запись файла и правка строки одного медиа не должны перемешаться с
 * соседней заменой того же медиа (иначе строка укажет на удалённый файл).
 *
 * Очередь живёт в памяти процесса: админка — один экземпляр приложения.
 */
export class KeyedQueue {
    private readonly tails = new Map<string, Promise<unknown>>();

    run<T>(key: string, work: () => Promise<T>): Promise<T> {
        const previous = this.tails.get(key) ?? Promise.resolve();
        const result = previous.then(work, work);
        const settled = result.then(
            () => undefined,
            () => undefined,
        );
        this.tails.set(key, settled);
        void settled.then(() => {
            if (this.tails.get(key) === settled) this.tails.delete(key);
        });
        return result;
    }
}
