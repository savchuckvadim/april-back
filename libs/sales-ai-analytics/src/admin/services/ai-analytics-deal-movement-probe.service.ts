/**
 * Проверка записи в ленту из админки (решение 17.11.2026): постановка
 * проверки одной сделки в очередь event-sales и чтение её итога из Redis.
 * Проверка ПИШЕТ в живой портал две записи — запускается только этой
 * ручкой, автоматического вызова нет. Сделку (открытая «ОП Основная»
 * портала) проверяет воркер: отказ — в итоге словами.
 *
 * `QueueDispatcherService` приходит опционально: без очереди ручка честно
 * отвечает «не подключено».
 */
import { Injectable, Optional } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import {
    DEAL_MOVEMENT_PROBE_JOB_OPTIONS,
    dealMovementProbeJobId,
    isDealMovementProbeResult,
    type DealMovementProbeJobData,
    type DealMovementProbeResult,
} from '../../contracts/deal-movement-probe.types';
import {
    DEAL_MOVEMENT_REDIS_KEYS,
    DEAL_MOVEMENT_REQUESTERS,
} from '../../contracts/deal-movement-run.types';
import { isQueueJobPending } from './queue-job-pending.util';

/** Ответ ручки `POST admin/ai-analytics/deal-movement-probe`. */
export interface DealMovementProbeRunResult {
    domain: string;
    dealId: number;
    dispatched: boolean;
    jobId: string | null;
    reason: string | null;
}

/** Ответ ручки `GET admin/ai-analytics/deal-movement-probe`. */
export interface DealMovementProbeStatusResult {
    domain: string;
    /** Проверка ждёт очереди или идёт. */
    pending: boolean;
    /** Итог последней проверки; null — не было (или истёк, 14 суток). */
    result: DealMovementProbeResult | null;
}

export const DEAL_MOVEMENT_PROBE_MESSAGES = {
    notWired:
        'Проверка не подключена в этой сборке: очереди нет, ставить её некуда.',
    alreadyQueued:
        'По этому порталу проверка уже идёт или ждёт очереди — дождитесь итога.',
} as const;

@Injectable()
export class AiAnalyticsDealMovementProbeService {
    constructor(
        private readonly redisService: RedisService,
        @Optional() private readonly dispatcher?: QueueDispatcherService,
    ) {}

    /** Поставить проверку; пока прошлая ждёт или идёт — отказ. */
    async probe(input: {
        domain: string;
        dealId: number;
    }): Promise<DealMovementProbeRunResult> {
        const base = { domain: input.domain, dealId: input.dealId };
        if (this.dispatcher === undefined) {
            return {
                ...base,
                dispatched: false,
                jobId: null,
                reason: DEAL_MOVEMENT_PROBE_MESSAGES.notWired,
            };
        }
        const jobId = dealMovementProbeJobId(input.domain);
        if (await this.isPending(this.dispatcher, jobId)) {
            return {
                ...base,
                dispatched: false,
                jobId,
                reason: DEAL_MOVEMENT_PROBE_MESSAGES.alreadyQueued,
            };
        }
        const data: DealMovementProbeJobData = {
            ...base,
            requestedBy: DEAL_MOVEMENT_REQUESTERS.admin,
        };
        await this.dispatcher.dispatch(
            QueueNames.EVENT_SALES_DEAL_MOVEMENT_RUN,
            JobNames.EVENT_SALES_DEAL_MOVEMENT_PROBE,
            data,
            jobId,
            DEAL_MOVEMENT_PROBE_JOB_OPTIONS,
        );
        return { ...base, dispatched: true, jobId, reason: null };
    }

    async status(domain: string): Promise<DealMovementProbeStatusResult> {
        const [pending, result] = await Promise.all([
            this.dispatcher === undefined
                ? Promise.resolve(false)
                : this.isPending(
                      this.dispatcher,
                      dealMovementProbeJobId(domain),
                  ),
            this.readResult(domain),
        ]);
        return { domain, pending, result };
    }

    private isPending(
        dispatcher: QueueDispatcherService,
        jobId: string,
    ): Promise<boolean> {
        return isQueueJobPending(
            dispatcher,
            QueueNames.EVENT_SALES_DEAL_MOVEMENT_RUN,
            jobId,
        );
    }

    private async readResult(
        domain: string,
    ): Promise<DealMovementProbeResult | null> {
        const raw = await this.redisService
            .getClient()
            .get(DEAL_MOVEMENT_REDIS_KEYS.probe(domain))
            .catch(() => null);
        if (!raw) return null;
        try {
            const value: unknown = JSON.parse(raw);
            return isDealMovementProbeResult(value) ? value : null;
        } catch {
            return null;
        }
    }
}
