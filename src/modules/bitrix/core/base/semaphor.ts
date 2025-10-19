
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

    release(): void {
        this.semaphore += 1;
        if (this.waiting.length > 0) {
            const next = this.waiting.shift();
            next?.();
        }
    }
}
