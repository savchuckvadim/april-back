import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import type { CallReportAnalyzeStagePayload } from '../use-cases/call-report-pipeline.use-case';

/** Сколько живут отметки догона: с запасом шире окна поиска (72 ч). */
const REPAIR_TTL_SEC = 4 * 24 * 60 * 60;

const failedKey = (domain: string): string =>
    `call-report:repair:failed:${domain.toLowerCase()}`;
const attemptsKey = (transcriptionId: string): string =>
    `call-report:repair:attempts:${transcriptionId}`;

/** Звонок, оставшийся без разбора: что поставить заново и когда упал. */
export interface FailedAnalysisEntry {
    payload: CallReportAnalyzeStagePayload;
    failedAt: string;
}

const isEntry = (value: unknown): value is FailedAnalysisEntry => {
    if (typeof value !== 'object' || value === null) return false;
    const entry = value as Partial<FailedAnalysisEntry>;
    return (
        typeof entry.failedAt === 'string' &&
        typeof entry.payload?.transcriptionId === 'string' &&
        typeof entry.payload?.domain === 'string'
    );
};

/**
 * Отметки догона разборов в Redis (без таблицы, миграция не нужна):
 * звонки, у которых модель не ответила ни на фокус-разбор, ни на
 * страховку, и счётчик попыток догона на звонок. Ошибка Redis не роняет
 * конвейер — отметка просто не появится, это видно в журнале.
 */
@Injectable()
export class CallAnalysisRepairStore {
    private readonly logger = new Logger(CallAnalysisRepairStore.name);

    constructor(private readonly redisService: RedisService) {}

    async markFailed(
        payload: CallReportAnalyzeStagePayload,
        now: Date = new Date(),
    ): Promise<void> {
        try {
            const redis = this.redisService.getClient();
            const key = failedKey(payload.domain);
            const entry: FailedAnalysisEntry = {
                payload,
                failedAt: now.toISOString(),
            };
            await redis.hset(
                key,
                payload.transcriptionId,
                JSON.stringify(entry),
            );
            await redis.expire(key, REPAIR_TTL_SEC);
            this.logger.warn(
                `Звонок без разбора (${payload.domain}, transcription ${payload.transcriptionId}) — отмечен для догона`,
            );
        } catch (error) {
            this.logger.error(
                `Отметка догона не записана (${payload.domain}, transcription ${payload.transcriptionId}): ${(error as Error).message}`,
            );
        }
    }

    async listFailed(domain: string): Promise<FailedAnalysisEntry[]> {
        const raw = await this.redisService
            .getClient()
            .hgetall(failedKey(domain));
        const entries: FailedAnalysisEntry[] = [];
        for (const value of Object.values(raw ?? {})) {
            try {
                const parsed: unknown = JSON.parse(value);
                if (isEntry(parsed)) entries.push(parsed);
            } catch {
                // битая запись — пропуск, её вытеснит TTL
            }
        }
        return entries;
    }

    async dropFailed(domain: string, transcriptionId: string): Promise<void> {
        await this.redisService
            .getClient()
            .hdel(failedKey(domain), transcriptionId);
    }

    async attempts(transcriptionId: string): Promise<number> {
        const value = await this.redisService
            .getClient()
            .get(attemptsKey(transcriptionId));
        const count = Number(value);
        return Number.isFinite(count) ? count : 0;
    }

    /** Ещё одна попытка догона; возвращает номер этой попытки. */
    async bumpAttempt(transcriptionId: string): Promise<number> {
        const redis = this.redisService.getClient();
        const key = attemptsKey(transcriptionId);
        const count = await redis.incr(key);
        await redis.expire(key, REPAIR_TTL_SEC);
        return count;
    }
}
