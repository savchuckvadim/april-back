import { RedisService } from '@/core/redis/redis.service';
import { RedisJsonCache } from '@/core/redis/redis-json-cache';
import {
    DuplicateEntityType,
    DuplicateSearchLevel,
    ExtractedSignals,
} from '../type/duplicate.type';

/**
 * Сколько живут сигналы сущности (телефоны, почты, ИНН её и её связей).
 *
 * Сбор сигналов — 2–3 пачки запросов к Битриксу (обход связей), и раньше
 * он шёл ДО проверки кэша результата: даже повторный поиск по тому же
 * клиенту стоил запросов. Телефоны и ИНН клиента за пять минут почти не
 * меняются, а «проверить ещё раз» (`force`) кэш обходит.
 */
export const DUPLICATE_SIGNALS_TTL_SEC = 300;

const isStringList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every(item => typeof item === 'string');

/** Запись той формы, что пишет этот код (после выкладки форма могла смениться). */
const isExtractedSignals = (value: unknown): value is ExtractedSignals => {
    if (!value || typeof value !== 'object') return false;
    const signals = value as Record<string, unknown>;
    return (
        isStringList(signals.phones) &&
        isStringList(signals.emails) &&
        isStringList(signals.inns) &&
        isStringList(signals.titles) &&
        Array.isArray(signals.origins) &&
        Array.isArray(signals.excluded)
    );
};

/** Ссылка на сущность, чьи сигналы кэшируются. */
export interface DuplicateSignalsRef {
    domain: string;
    entityType: DuplicateEntityType;
    entityId: number;
    level: DuplicateSearchLevel;
}

/**
 * Кэш сигналов сущности в Redis. Не `@Injectable` — создаётся сервисом
 * поиска; без Redis (юнит-тесты) чтение пустое, запись молчит.
 */
export class DuplicateSignalsCache {
    private readonly cache: RedisJsonCache<ExtractedSignals>;

    constructor(redis?: RedisService) {
        this.cache = new RedisJsonCache<ExtractedSignals>(redis, {
            name: 'duplicate-signals',
            ttlSec: DUPLICATE_SIGNALS_TTL_SEC,
            guard: isExtractedSignals,
        });
    }

    get(ref: DuplicateSignalsRef): Promise<ExtractedSignals | undefined> {
        return this.cache.get(keyOf(ref));
    }

    set(ref: DuplicateSignalsRef, signals: ExtractedSignals): Promise<void> {
        return this.cache.set(keyOf(ref), signals);
    }
}

const keyOf = (ref: DuplicateSignalsRef): string =>
    `pbx:dup-signals:v1:${ref.domain}:${ref.entityType}:${ref.entityId}:${ref.level}`;
