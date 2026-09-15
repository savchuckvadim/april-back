import { Injectable, Logger } from '@nestjs/common';
import { AiAnalyticsCacheService } from '../cache/ai-analytics-cache.service';
import { AI_BRIEF_QUOTA_TTL_SECONDS } from '../constants/ai-brief.const';
import { buildBriefQuotaKey } from './brief-cache-key.util';

/** Итог попытки занять квоту: пустить вызов и сколько уже потрачено. */
export interface BriefQuotaAttempt {
    /** Вызов модели разрешён (после него счётчик уже увеличен). */
    allowed: boolean;
    /** Вызовов за день ПОСЛЕ этой попытки (при отказе — прежнее значение). */
    used: number;
    /** Действующая квота дня (`brief_quota_per_day`). */
    limit: number;
}

/**
 * Дневная квота вызовов модели для резюме (план §5.3): счётчик
 * `sales-ai-analytics:v1:{domain}:brief-quota:{YYYY-MM-DD}` в AppCache
 * (Redis + app_cache), TTL — сутки с запасом.
 *
 * Счётчик мягкий и не атомарный: AppCache не умеет INCR, поэтому два
 * одновременных вызова в одну миллисекунду могут занять одну единицу
 * квоты. Это осознанно: квота защищает от разгона расходов, а не от
 * гонки на единицу; жёсткий лимит потребовал бы Redis-примитива и
 * собственного стора.
 */
@Injectable()
export class BriefQuotaStore {
    private readonly logger = new Logger(BriefQuotaStore.name);

    constructor(private readonly cache: AiAnalyticsCacheService) {}

    /** Сколько вызовов модели уже потрачено за день (0 — счётчика нет). */
    async used(domain: string, date: string): Promise<number> {
        const value = await this.cache.getJson<number>(
            buildBriefQuotaKey(domain, date),
        );

        return typeof value === 'number' && Number.isFinite(value) && value > 0
            ? Math.floor(value)
            : 0;
    }

    /**
     * Занимает единицу квоты: при `used >= limit` отказ (резюме соберёт
     * шаблон с причиной `quota-exceeded`), иначе счётчик увеличивается.
     * Лимит 0 запрещает вызовы модели вовсе.
     */
    async consume(
        domain: string,
        date: string,
        limit: number,
    ): Promise<BriefQuotaAttempt> {
        const used = await this.used(domain, date);
        if (used >= limit) {
            this.logger.log(
                `Квота резюме исчерпана (${domain}, ${date}): ${used}/${limit}`,
            );

            return { allowed: false, used, limit };
        }
        const next = used + 1;
        try {
            await this.cache.setJson(
                buildBriefQuotaKey(domain, date),
                next,
                AI_BRIEF_QUOTA_TTL_SECONDS,
            );
        } catch (error) {
            // Счётчик не записан — вызов всё равно разрешаем: отказать
            // из-за недоступного кэша значило бы гасить витрину.
            this.logger.warn(
                `Счётчик квоты резюме не записан (${domain}): ` +
                    `${(error as Error).message}`,
            );
        }

        return { allowed: true, used: next, limit };
    }
}
