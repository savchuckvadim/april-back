/**
 * Короткий кэш в памяти процесса с общим ожиданием одной загрузки.
 *
 * Для данных, которые читаются на каждом шаге, а меняются редко (модель
 * портала, справочники). Два свойства, ради которых он существует:
 *
 *  - запись живёт недолго (TTL), поэтому правка источника доезжает сама,
 *    без сквозной инвалидации между процессами;
 *  - параллельные запросы одного ключа ждут ОДНУ загрузку, а не запускают
 *    каждый свою: десять одновременных открытий карточки не превращаются
 *    в десять одинаковых чтений базы.
 *
 * `undefined` не кэшируется: «не получилось» не должно запоминаться — иначе
 * разовый сбой чтения прятал бы данные до конца срока жизни записи.
 *
 * Значение отдаётся ОДНИМ И ТЕМ ЖЕ объектом всем читателям. Если читатели
 * могут его менять — копируйте сами (`structuredClone`).
 *
 * Ключей может быть много (по клиенту, по сделке) — тогда задайте
 * `maxEntries`: сверх него сначала выбрасываются истёкшие записи, затем
 * самые старые. Без потолка запись живёт, пока её не перезапишут.
 */
export class TimedCache<T> {
    private readonly entries = new Map<
        string,
        { value: T; loadedAt: number }
    >();
    private readonly inFlight = new Map<string, Promise<T | undefined>>();

    /**
     * @param ttlMs срок жизни записи; 0 и меньше — кэш выключен (загрузка
     *   на каждый вызов, но параллельные всё равно склеиваются)
     * @param now источник времени — подменяется в тестах
     * @param maxEntries потолок записей; не задан — без потолка
     */
    constructor(
        private readonly ttlMs: number,
        private readonly now: () => number = Date.now,
        private readonly maxEntries?: number,
    ) {}

    async get(
        key: string,
        load: () => Promise<T | undefined>,
    ): Promise<T | undefined> {
        const entry = this.entries.get(key);
        if (entry && this.now() - entry.loadedAt < this.ttlMs) {
            return entry.value;
        }

        const pending = this.inFlight.get(key);
        if (pending) return pending;

        const loading = load()
            .then(value => {
                if (value === undefined || this.ttlMs <= 0) {
                    this.entries.delete(key);
                } else {
                    // Перезапись в конец: порядок Map — порядок свежести.
                    this.entries.delete(key);
                    this.entries.set(key, { value, loadedAt: this.now() });
                    this.evict();
                }
                return value;
            })
            .finally(() => {
                this.inFlight.delete(key);
            });
        this.inFlight.set(key, loading);
        return loading;
    }

    /** Сбросить запись: следующий `get` загрузит заново. */
    delete(key: string): void {
        this.entries.delete(key);
    }

    /** Сколько записей сейчас в памяти (для тестов и метрик). */
    get size(): number {
        return this.entries.size;
    }

    /** Сверх потолка: сначала истёкшие, потом самые старые. */
    private evict(): void {
        if (!this.maxEntries || this.entries.size <= this.maxEntries) return;
        const now = this.now();
        for (const [key, entry] of this.entries) {
            if (now - entry.loadedAt >= this.ttlMs) this.entries.delete(key);
        }
        for (const key of this.entries.keys()) {
            if (this.entries.size <= this.maxEntries) break;
            this.entries.delete(key);
        }
    }
}
