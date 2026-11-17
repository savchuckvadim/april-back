/**
 * Движение сделок из админки (этап 7.3): постановка прогона портала в
 * очередь event-sales (там Битрикс, крон и замок портала) и чтение
 * состояния — ход последнего прогона из Redis плюс последний дневной
 * снимок из ais.
 *
 * `QueueDispatcherService` приходит опционально: без очереди (спеки,
 * сборки без Redis) ручка честно отвечает «не подключено».
 */
import { Injectable, Optional } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import {
    DEAL_MOVEMENT_JOB_OPTIONS,
    DEAL_MOVEMENT_REDIS_KEYS,
    DEAL_MOVEMENT_REQUESTERS,
    dealMovementJobId,
    isDealMovementRunStatusLike,
    type DealMovementJobData,
    type DealMovementRunStatus,
} from '../../contracts/deal-movement-run.types';
import {
    isDealMovementSnapshotPayload,
    type DealMovementSnapshotPayload,
} from '../../contracts/deal-movement-snapshot.types';
import { AI_ANALYTICS_SNAPSHOT_TYPE } from '../../contracts/snapshot-kinds.const';
import { AiAnalyticsAdminSnapshotStore } from '../ai-analytics-admin-snapshot.store';
import { isQueueJobPending } from './queue-job-pending.util';

/** Ответ ручки `POST admin/ai-analytics/deal-movement`. */
export interface DealMovementRunResult {
    domain: string;
    dryRun: boolean;
    dispatched: boolean;
    jobId: string | null;
    reason: string | null;
}

/** Ответ ручки `GET admin/ai-analytics/deal-movement-status`. */
export interface DealMovementStatusResult {
    domain: string;
    /** Включён ли ночной счёт на портале (настройка приложения). */
    enabled: boolean;
    /** Ход и итог последнего прогона; null — прогонов не было (или истёк). */
    run: DealMovementRunStatus | null;
    /** Последний дневной снимок ночного счёта; null — ещё не было. */
    lastSnapshot: DealMovementSnapshotPayload | null;
    runAvailable: boolean;
    hint: string;
}

export const DEAL_MOVEMENT_ADMIN_MESSAGES = {
    runNotWired:
        'Движение сделок не подключено в этой сборке: очереди нет, ставить ' +
        'прогон некуда.',
    alreadyQueued:
        'По этому порталу прогон уже идёт или ждёт очереди — дождитесь итога.',
    hint:
        'Порядок: «Посчитать» (dryRun: true, ничего не сохраняется, итог — в ' +
        'состоянии прогона) → включить «Движение сделок» в настройках ' +
        'приложения event-sales → ночной счёт сам, 02:00–05:00 по времени ' +
        'портала. dryRun: false — внеочередной счёт сейчас: сегодняшнюю ночь ' +
        'крон уже не повторит. В ленту сделок пишет только ночной счёт и ' +
        'только если включена «Движение сделок: писать в ленту сделки»: ' +
        'ручной счёт записи не делает, а оставляет их до ночи; «Посчитать» ' +
        'покажет, сколько записей ушло бы.',
} as const;

@Injectable()
export class AiAnalyticsDealMovementService {
    constructor(
        private readonly store: AiAnalyticsAdminSnapshotStore,
        private readonly redisService: RedisService,
        private readonly appSettings: PortalAppSettingsService,
        @Optional() private readonly dispatcher?: QueueDispatcherService,
    ) {}

    /** Поставить прогон портала; пока прошлый того же режима ждёт или идёт — отказ. */
    async run(input: {
        domain: string;
        dryRun: boolean;
    }): Promise<DealMovementRunResult> {
        const base = { domain: input.domain, dryRun: input.dryRun };
        if (this.dispatcher === undefined) {
            return {
                ...base,
                dispatched: false,
                jobId: null,
                reason: DEAL_MOVEMENT_ADMIN_MESSAGES.runNotWired,
            };
        }
        const jobId = dealMovementJobId(input.domain, input.dryRun);
        if (
            await isQueueJobPending(
                this.dispatcher,
                QueueNames.EVENT_SALES_DEAL_MOVEMENT_RUN,
                jobId,
            )
        ) {
            return {
                ...base,
                dispatched: false,
                jobId,
                reason: DEAL_MOVEMENT_ADMIN_MESSAGES.alreadyQueued,
            };
        }
        const data: DealMovementJobData = {
            domain: input.domain,
            dryRun: input.dryRun,
            requestedBy: DEAL_MOVEMENT_REQUESTERS.admin,
        };
        await this.dispatcher.dispatch(
            QueueNames.EVENT_SALES_DEAL_MOVEMENT_RUN,
            JobNames.EVENT_SALES_DEAL_MOVEMENT_RUN,
            data,
            jobId,
            DEAL_MOVEMENT_JOB_OPTIONS,
        );
        return { ...base, dispatched: true, jobId, reason: null };
    }

    async status(domain: string): Promise<DealMovementStatusResult> {
        const [enabled, run, lastSnapshot] = await Promise.all([
            this.isEnabled(domain),
            this.readRun(domain),
            this.readSnapshot(domain),
        ]);
        return {
            domain,
            enabled,
            run,
            lastSnapshot,
            runAvailable: this.dispatcher !== undefined,
            hint: DEAL_MOVEMENT_ADMIN_MESSAGES.hint,
        };
    }

    private async isEnabled(domain: string): Promise<boolean> {
        const settings = await this.appSettings.resolve(
            domain,
            EnumPortalAppCode.eventSales,
        );
        return settings.dealMovementEnabled === true;
    }

    private async readRun(
        domain: string,
    ): Promise<DealMovementRunStatus | null> {
        const raw = await this.redisService
            .getClient()
            .get(DEAL_MOVEMENT_REDIS_KEYS.status(domain))
            .catch(() => null);
        if (!raw) return null;
        try {
            const value: unknown = JSON.parse(raw);
            return isDealMovementRunStatusLike(value) ? value : null;
        } catch {
            return null;
        }
    }

    private async readSnapshot(
        domain: string,
    ): Promise<DealMovementSnapshotPayload | null> {
        const [latest] = await this.store.read<unknown>(
            domain,
            [AI_ANALYTICS_SNAPSHOT_TYPE.dealMovement],
            { limit: 1 },
        );
        return latest && isDealMovementSnapshotPayload(latest.payload)
            ? latest.payload
            : null;
    }
}
