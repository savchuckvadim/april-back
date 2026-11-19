import type { Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import type { RedisService } from '@lib/core/redis/redis.service';
import {
    parseTranscriptSegments,
    type TranscriptSegment,
} from '../types/transcript-segment.types';

/** Префикс ключа прогресса; версия — форма записи. */
export const CHUNK_PROGRESS_KEY_PREFIX = 'stt-chunks:v1:';
/** Срок прогресса звонка: сутки — догон успевает повторить звонок. */
export const CHUNK_PROGRESS_TTL_SEC = 24 * 60 * 60;
/** Поле хеша с нарезкой, под которую записан прогресс. */
const META_FIELD = 'meta';

export const CHUNK_PROGRESS_STATUSES = ['done', 'failed'] as const;
export type ChunkProgressStatus = (typeof CHUNK_PROGRESS_STATUSES)[number];

/** Нарезка звонка: другая длина куска или другая запись — прогресс не подходит. */
export interface ChunkProgressMeta {
    chunkSec: number;
    overlapSec: number;
    chunks: number;
    bytes: number;
}

/** Распознанный кусок, который не нужно распознавать повторно. */
export interface DoneChunk {
    provider: string;
    text: string;
    segments: TranscriptSegment[] | null;
}

export const chunkProgressKey = (callKey: string): string =>
    `${CHUNK_PROGRESS_KEY_PREFIX}${callKey}`;

export const chunkProgressField = (index: number): string => `chunk:${index}`;

const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

function parseJson(raw: string | undefined): unknown {
    if (raw === undefined) return undefined;
    try {
        return JSON.parse(raw) as unknown;
    } catch {
        return undefined;
    }
}

function sameMeta(raw: string | undefined, meta: ChunkProgressMeta): boolean {
    const stored = parseJson(raw);
    return (
        isRecord(stored) &&
        stored.chunkSec === meta.chunkSec &&
        stored.overlapSec === meta.overlapSec &&
        stored.chunks === meta.chunks &&
        stored.bytes === meta.bytes
    );
}

/** Готовый кусок из записи; чужая форма — куска нет, распознаём заново. */
function parseDone(raw: string | undefined): DoneChunk | null {
    const stored = parseJson(raw);
    if (
        !isRecord(stored) ||
        stored.status !== 'done' ||
        typeof stored.provider !== 'string' ||
        typeof stored.text !== 'string'
    ) {
        return null;
    }
    return {
        provider: stored.provider,
        text: stored.text,
        segments: parseTranscriptSegments(stored.segments),
    };
}

/**
 * Прогресс распознавания кусков одного звонка в Redis: хеш
 * `stt-chunks:v1:<callKey>` — поле `meta` (нарезка) и по полю
 * `chunk:<номер>` на кусок: статус, распознаватель, текст и сегменты
 * готового или ошибки упавшего. Срок — сутки от последней записи.
 *
 * Прогресс никогда не ломает распознавание: Redis недоступен — одно
 * предупреждение в журнал, дальше звонок идёт без сохранения. Не
 * `@Injectable`: создаётся на звонок из `RedisService` сервиса.
 */
export class ChunkProgressStore {
    private readonly key: string;
    private available: boolean;

    constructor(
        private readonly redis: RedisService | undefined,
        callKey: string,
        private readonly logger: Logger,
    ) {
        this.key = chunkProgressKey(callKey);
        this.available = redis !== undefined;
    }

    /**
     * Готовые куски прошлого запуска. Прогресс другой нарезки (сменилась
     * длина куска, другая запись) сбрасывается — номера кусков не совпадут.
     */
    async load(meta: ChunkProgressMeta): Promise<Map<number, DoneChunk>> {
        const ready = new Map<number, DoneChunk>();
        const stored = await this.run(client => client.hgetall(this.key));
        if (stored === undefined) return ready;
        if (sameMeta(stored[META_FIELD], meta)) {
            for (let index = 0; index < meta.chunks; index++) {
                const done = parseDone(stored[chunkProgressField(index)]);
                if (done) ready.set(index, done);
            }
            return ready;
        }
        if (Object.keys(stored).length > 0) {
            this.logger.warn(
                `Прогресс кусков ${this.key} записан под другую нарезку — распознаём заново`,
            );
            await this.run(client => client.del(this.key));
        }
        await this.write(META_FIELD, meta);
        return ready;
    }

    async saveDone(index: number, chunk: DoneChunk): Promise<void> {
        await this.write(chunkProgressField(index), {
            status: 'done' satisfies ChunkProgressStatus,
            ...chunk,
            at: new Date().toISOString(),
        });
    }

    async saveFailed(index: number, errors: readonly string[]): Promise<void> {
        await this.write(chunkProgressField(index), {
            status: 'failed' satisfies ChunkProgressStatus,
            errors,
            at: new Date().toISOString(),
        });
    }

    /** Звонок склеен — прогресс больше не нужен. */
    async clear(): Promise<void> {
        await this.run(client => client.del(this.key));
    }

    private async write(field: string, value: unknown): Promise<void> {
        await this.run(async client => {
            await client.hset(this.key, field, JSON.stringify(value));
            await client.expire(this.key, CHUNK_PROGRESS_TTL_SEC);
        });
    }

    /** Команда Redis; первая ошибка выключает прогресс до конца звонка. */
    private async run<T>(
        command: (client: Redis) => Promise<T>,
    ): Promise<T | undefined> {
        if (!this.available || !this.redis) return undefined;
        try {
            return await command(this.redis.getClient());
        } catch (error) {
            this.available = false;
            this.logger.warn(
                `Прогресс кусков ${this.key}: Redis недоступен (${errorText(error)}) — продолжаем без сохранения прогресса`,
            );
            return undefined;
        }
    }
}
