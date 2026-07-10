/**
 * Ограничение числа параллельных запросов к порталу.
 * Собственная копия (не импорт из @lib/bitrix) — чтобы core
 * библиотеки v3 не зависел от внутренностей v1.
 */
export class Semaphore {
    private free: number;
    private readonly waiting: Array<() => void> = [];

    constructor(count: number) {
        this.free = count;
    }

    async acquire(): Promise<void> {
        if (this.free > 0) {
            this.free -= 1;
        } else {
            await new Promise<void>(resolve => this.waiting.push(resolve));
        }
    }

    release(): void {
        const next = this.waiting.shift();
        if (next) {
            next();
        } else {
            this.free += 1;
        }
    }
}
