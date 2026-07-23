/**
 * Простой счётный семафор для ограничения параллелизма внешних вызовов
 * (транскрибаторы, LLM-провайдеры): не более `limit` одновременных задач,
 * остальные ждут в FIFO-очереди.
 *
 * Используется вместо внешних зависимостей (bottleneck и т.п.) — нам нужен
 * только per-provider лимит одновременности, без rate-per-second логики.
 */
export class Semaphore {
    private active = 0;
    private readonly queue: (() => void)[] = [];

    constructor(private readonly limit: number) {
        if (!Number.isFinite(limit) || limit < 1) {
            throw new Error(`Semaphore limit must be >= 1, got ${limit}`);
        }
    }

    /** Сколько задач выполняется прямо сейчас. */
    get activeCount(): number {
        return this.active;
    }

    /** Сколько задач ждёт слота. */
    get pendingCount(): number {
        return this.queue.length;
    }

    /**
     * Выполняет fn, когда освободится слот. Слот освобождается всегда —
     * и при успехе, и при исключении.
     */
    async run<T>(fn: () => Promise<T>): Promise<T> {
        await this.acquire();
        try {
            return await fn();
        } finally {
            this.release();
        }
    }

    private acquire(): Promise<void> {
        if (this.active < this.limit) {
            this.active++;
            return Promise.resolve();
        }
        return new Promise<void>(resolve => {
            this.queue.push(() => {
                this.active++;
                resolve();
            });
        });
    }

    private release(): void {
        this.active--;
        const next = this.queue.shift();
        if (next) next();
    }
}

/**
 * Читает лимит параллелизма из env-значения: положительное целое или default.
 */
export function parseConcurrency(
    raw: string | undefined,
    defaultValue: number,
): number {
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : defaultValue;
}
