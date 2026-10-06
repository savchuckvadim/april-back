// Простая реализация семафора (ограничение параллельных запросов)
export class Semaphore {
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

    /**
     * Освободить слот. Если кто-то ждёт — слот ПЕРЕХОДИТ ему, счётчик не
     * растёт. Раньше счётчик увеличивался всегда, а разбуженный ждущий его
     * не уменьшал: после каждой очереди предел тихо растягивался, и
     * «не больше десяти одновременно» переставало выполняться.
     */
    release(): void {
        const next = this.waiting.shift();
        if (next) {
            next();
            return;
        }
        this.semaphore += 1;
    }
}
