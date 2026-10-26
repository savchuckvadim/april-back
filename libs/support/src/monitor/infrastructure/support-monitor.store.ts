import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    SUPPORT_WAIT_LEVELS,
    SupportDialogMemory,
    SupportWaitLevel,
} from '../domain/support-dialog.types';

/**
 * Пространство памяти: боевое и «только считать». Раздельные, чтобы после
 * выключения «только считать» открытые диалоги объявились по-настоящему,
 * а не считались уже разосланными пробным прогоном.
 */
export const SUPPORT_MEMORY_MODES = ['live', 'dry'] as const;
export type SupportMemoryMode = (typeof SUPPORT_MEMORY_MODES)[number];

/** Память о диалоге живёт неделю: диалоги линии закрываются за часы. */
const MEMORY_TTL_SEC = 7 * 24 * 60 * 60;
/** Лок такта: один процесс на кластер; такт — секунды, запас на сбои. */
const LOCK_TTL_SEC = 5 * 60;
/** Тревога разработчику о сбое — не чаще раза в час на портал. */
const ALERT_TTL_SEC = 60 * 60;
/** Запас окна просмотра: крон минутный, иначе интервал сползал бы на тик. */
const POLL_SKEW_SEC = 15;

const PREFIX = 'support-monitor';
const LOCK_KEY = `${PREFIX}:lock`;

const isWaitLevel = (value: unknown): value is SupportWaitLevel =>
    (SUPPORT_WAIT_LEVELS as readonly unknown[]).includes(value);

/** Разбор памяти из Redis; испорченная запись — как будто памяти нет. */
export function parseSupportMemory(
    raw: string | null,
): SupportDialogMemory | null {
    if (!raw) return null;
    try {
        const value = JSON.parse(raw) as Partial<SupportDialogMemory>;
        if (typeof value?.announced !== 'boolean') return null;
        return {
            announced: value.announced,
            waitingFor:
                typeof value.waitingFor === 'number' ? value.waitingFor : null,
            levels: Array.isArray(value.levels)
                ? value.levels.filter(isWaitLevel)
                : [],
        };
    } catch {
        return null;
    }
}

/**
 * Состояние монитора в Redis: память о разосланном, лок такта, окно
 * просмотра линии и окно тревог. База данных и миграции не нужны.
 */
@Injectable()
export class SupportMonitorStore {
    private readonly redis: Redis;

    constructor(redisService: RedisService) {
        this.redis = redisService.getClient();
    }

    async loadMemories(
        mode: SupportMemoryMode,
        domain: string,
        sessionIds: readonly number[],
    ): Promise<Map<number, SupportDialogMemory>> {
        const memories = new Map<number, SupportDialogMemory>();
        if (!sessionIds.length) return memories;
        const raws = await this.redis.mget(
            ...sessionIds.map(id => this.memoryKey(mode, domain, id)),
        );
        sessionIds.forEach((id, index) => {
            const memory = parseSupportMemory(raws[index] ?? null);
            if (memory) memories.set(id, memory);
        });
        return memories;
    }

    async saveMemory(
        mode: SupportMemoryMode,
        domain: string,
        sessionId: number,
        memory: SupportDialogMemory,
    ): Promise<void> {
        await this.redis.set(
            this.memoryKey(mode, domain, sessionId),
            JSON.stringify(memory),
            'EX',
            MEMORY_TTL_SEC,
        );
    }

    /** Лок такта; false — другой процесс уже смотрит линии. */
    async acquireLock(): Promise<boolean> {
        const result = await this.redis.set(
            LOCK_KEY,
            String(process.pid),
            'EX',
            LOCK_TTL_SEC,
            'NX',
        );
        return result === 'OK';
    }

    async releaseLock(): Promise<void> {
        await this.redis.del(LOCK_KEY).catch(() => undefined);
    }

    /**
     * Пора ли смотреть линию портала: окно в `pollMinutes` минут ставится
     * атомарно, поэтому «проверить» и «отметить» — одна операция.
     */
    async claimPoll(domain: string, pollMinutes: number): Promise<boolean> {
        const ttl = Math.max(30, pollMinutes * 60 - POLL_SKEW_SEC);
        const result = await this.redis.set(
            `${PREFIX}:poll:${domain}`,
            new Date().toISOString(),
            'EX',
            ttl,
            'NX',
        );
        return result === 'OK';
    }

    /** Можно ли сейчас тревожить разработчика сбоем по порталу. */
    async allowAlert(domain: string): Promise<boolean> {
        const result = await this.redis
            .set(`${PREFIX}:alert:${domain}`, '1', 'EX', ALERT_TTL_SEC, 'NX')
            .catch(() => 'OK');
        return result === 'OK';
    }

    private memoryKey(
        mode: SupportMemoryMode,
        domain: string,
        sessionId: number,
    ): string {
        return `${PREFIX}:${mode}:${domain}:session:${sessionId}`;
    }
}
