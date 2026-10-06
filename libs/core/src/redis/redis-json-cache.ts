import { Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

export interface RedisJsonCacheOptions<T> {
    /** Имя кэша — для строк лога. */
    name: string;
    /** Сколько живёт запись, секунд. */
    ttlSec: number;
    /**
     * Проверка формы прочитанного: в Redis лежит то, что записала прошлая
     * версия кода, и после выкладки форма могла измениться. Не прошло —
     * считаем, что записи нет.
     */
    guard: (value: unknown) => value is T;
}

/**
 * Короткоживущий JSON-кэш в Redis для ответов Битрикса.
 *
 * Зачем отдельный класс: одни и те же три шага (прочитать и проверить,
 * записать со сроком, сбросить) нужны нескольким читающим ручкам, и в каждой
 * их писали бы заново — с разным поведением при сбое Redis.
 *
 * Правило одно: кэш НИКОГДА не ломает основной путь. Redis недоступен, запись
 * повреждена, форма не та — это «в кэше ничего нет», вызывающий идёт в
 * Битрикс. Экземпляр Битрикса здесь не хранится — только данные, которые
 * вызывающий сам положил.
 *
 * Не `@Injectable`: создаётся в сервисе из его `RedisService`
 * (`new RedisJsonCache(redis, {...})`). Redis необязателен — без него
 * (юнит-тесты, приложение без кэша) чтение всегда пустое, запись молчит.
 */
export class RedisJsonCache<T> {
    private readonly logger: Logger;

    constructor(
        private readonly redis: RedisService | undefined,
        private readonly options: RedisJsonCacheOptions<T>,
    ) {
        this.logger = new Logger(`RedisJsonCache:${options.name}`);
    }

    /** Значение по ключу; undefined — записи нет (или кэш недоступен). */
    async get(key: string): Promise<T | undefined> {
        if (!this.redis) return undefined;
        try {
            const raw = await this.redis.getClient().get(key);
            if (raw === null) return undefined;
            const parsed: unknown = JSON.parse(raw);
            return this.options.guard(parsed) ? parsed : undefined;
        } catch (error) {
            this.logger.warn(`не прочитан ${key}: ${errorText(error)}`);
            return undefined;
        }
    }

    async set(key: string, value: T): Promise<void> {
        if (!this.redis) return;
        try {
            await this.redis
                .getClient()
                .set(key, JSON.stringify(value), 'EX', this.options.ttlSec);
        } catch (error) {
            this.logger.warn(`не записан ${key}: ${errorText(error)}`);
        }
    }

    /** Сброс записей: данные изменились, ждать срока нельзя. */
    async del(...keys: string[]): Promise<void> {
        if (!this.redis || !keys.length) return;
        try {
            await this.redis.getClient().del(...keys);
        } catch (error) {
            this.logger.warn(
                `не сброшен ${keys.join(', ')}: ${errorText(error)}`,
            );
        }
    }

    /**
     * Значение из кэша, а при промахе — из `load` с записью в кэш.
     * `undefined` из `load` не кэшируется: «не удалось» не должно прилипать.
     */
    async getOrLoad(
        key: string,
        load: () => Promise<T | undefined>,
    ): Promise<T | undefined> {
        const cached = await this.get(key);
        if (cached !== undefined) return cached;
        const fresh = await load();
        if (fresh !== undefined) await this.set(key, fresh);
        return fresh;
    }
}

const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);
