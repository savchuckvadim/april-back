/**
 * Счётчик запросов на ключ в окне фиксированной длины. Держит состояние в памяти
 * процесса: защищает публичную ручку от случайного и простого перебора, на
 * нескольких репликах лимит считается в каждой отдельно.
 */
export class FixedWindowLimiter {
    private readonly windows = new Map<
        string,
        { startedAt: number; count: number }
    >();

    constructor(
        private readonly limit: number,
        private readonly windowMs: number,
    ) {}

    /** true — запрос укладывается в лимит и засчитан. */
    consume(key: string, now: number = Date.now()): boolean {
        this.dropFinished(now);
        const current = this.windows.get(key);
        if (!current) {
            this.windows.set(key, { startedAt: now, count: 1 });
            return true;
        }
        if (current.count >= this.limit) return false;
        current.count += 1;
        return true;
    }

    private dropFinished(now: number): void {
        for (const [key, window] of this.windows) {
            if (now - window.startedAt >= this.windowMs) {
                this.windows.delete(key);
            }
        }
    }
}
