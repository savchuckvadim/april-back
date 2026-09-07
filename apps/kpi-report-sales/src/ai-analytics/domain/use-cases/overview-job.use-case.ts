import { Injectable, Logger } from '@nestjs/common';
import { WsService } from '@/core/ws';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import { overviewTtlSeconds } from '../../cache/cache-key.util';
import { AI_ANALYTICS_WS_EVENTS } from '../../constants/ai-analytics.const';
import { AI_ANALYTICS_OVERVIEW_TTL_SECONDS } from '../../constants/ai-overview.const';
import { AiOverviewJobData } from '../../dto/ai-overview-request.dto';
import {
    AiOverviewCacheEntry,
    AiOverviewDto,
    AiOverviewWsDonePayload,
    AiOverviewWsErrorPayload,
} from '../../dto/ai-overview.dto';
import { OverviewUseCase } from './overview.use-case';

/**
 * Выполнение джобы SALES_AI_ANALYTICS_OVERVIEW (план 6.4): расчёт
 * OverviewUseCase → write-through в кэш под requestKey (TTL по положению
 * периода: закрытый — 30 дней, живой — 180 с) → WS
 * ai-analytics:overview:done с requestKey (фронт повторяет POST — данные
 * по WS не уходят, периметр применяется ручкой). Ошибка → error-конверт
 * на 120 с (промах не ставит джобу заново сразу после падения) → WS
 * :error → rethrow (Bull помечает failed, attempts: 1).
 */
@Injectable()
export class OverviewJobUseCase {
    private readonly logger = new Logger(OverviewJobUseCase.name);

    constructor(
        private readonly overview: OverviewUseCase,
        private readonly cache: AiAnalyticsCacheService,
        private readonly ws: WsService,
    ) {}

    async execute(
        data: AiOverviewJobData,
        now = new Date(),
    ): Promise<AiOverviewDto> {
        try {
            const dto = await this.overview.execute(data, { now });
            await this.store(
                data.requestKey,
                { status: 'ready', data: dto },
                overviewTtlSeconds(data.to, now, dto.period.timeZone),
            );
            this.notify<AiOverviewWsDonePayload>(
                data.socketId,
                AI_ANALYTICS_WS_EVENTS.OVERVIEW_DONE,
                {
                    requestKey: data.requestKey,
                    generatedAt: dto.meta.generatedAt,
                },
            );
            return dto;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            this.logger.error(`Обзор ${data.requestKey} упал: ${message}`, {
                domain: data.domain,
            });
            await this.store(
                data.requestKey,
                { status: 'error', message },
                AI_ANALYTICS_OVERVIEW_TTL_SECONDS.error,
            );
            this.notify<AiOverviewWsErrorPayload>(
                data.socketId,
                AI_ANALYTICS_WS_EVENTS.OVERVIEW_ERROR,
                { requestKey: data.requestKey, message },
            );
            throw error;
        }
    }

    /** Ошибка записи кэша не должна маскировать/ронять результат расчёта. */
    private async store(
        key: string,
        entry: AiOverviewCacheEntry,
        ttlSeconds: number,
    ): Promise<void> {
        try {
            await this.cache.setJson(key, entry, ttlSeconds);
        } catch (error) {
            this.logger.warn(
                `Кэш ${key} не записан: ${(error as Error).message}`,
            );
        }
    }

    private notify<T>(
        socketId: string | undefined,
        event: string,
        data: T,
    ): void {
        if (!socketId) return;
        this.ws.sendToClient(socketId, { event, data });
    }
}
