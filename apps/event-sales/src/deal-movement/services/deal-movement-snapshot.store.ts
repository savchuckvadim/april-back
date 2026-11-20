import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { AiService, pickActiveRecord } from '@lib/call-lib';
import {
    AI_ANALYTICS_SNAPSHOT_APP,
    AI_ANALYTICS_SNAPSHOT_PROVIDER,
    AI_ANALYTICS_SNAPSHOT_STATUS,
    AI_ANALYTICS_SNAPSHOT_TYPE,
    DEAL_MOVEMENT_DEALS_KEY,
    type AiAnalyticsSnapshotType,
    type DealMovementDealsSnapshotPayload,
    type DealMovementSnapshotPayload,
    type SnapshotUserResult,
} from '@lib/sales-ai-analytics';

/** Что пишется в запись ais: тип, ключ, нагрузка и метки. */
interface SnapshotWrite<T> {
    readonly type: AiAnalyticsSnapshotType;
    readonly key: string;
    readonly payload: T;
    readonly generatedAt: string;
    readonly calcVersion: string;
}

/**
 * Записи движения сделок в ais, конверт снапшотов AI-аналитики
 * (`SnapshotUserResult`), провайдер и приложение — общие для снапшотов:
 * - дневной снимок `ai-analytics-deal-movement`, ключ (activity_id) — день
 *   портала; повтор за тот же день (внеочередной счёт из админки)
 *   обновляет запись на месте — у дня одна запись;
 * - проблемные сделки последней ночи `ai-analytics-deal-movement-deals`,
 *   ключ `latest` — одна запись портала, каждая ночь её перезаписывает.
 *
 * `@Injectable` без bitrix-состояния: только AiService.
 */
@Injectable()
export class DealMovementSnapshotStore {
    constructor(private readonly aiService: AiService) {}

    save(
        domain: string,
        payload: DealMovementSnapshotPayload,
    ): Promise<string> {
        return this.upsert(domain, {
            type: AI_ANALYTICS_SNAPSHOT_TYPE.dealMovement,
            key: payload.day,
            payload,
            generatedAt: payload.generatedAt,
            calcVersion: payload.calcVersion,
        });
    }

    /** Список проблемных сделок ночи — на место прежнего. */
    saveProblemDeals(
        domain: string,
        payload: DealMovementDealsSnapshotPayload,
    ): Promise<string> {
        return this.upsert(domain, {
            type: AI_ANALYTICS_SNAPSHOT_TYPE.dealMovementDeals,
            key: DEAL_MOVEMENT_DEALS_KEY,
            payload,
            generatedAt: payload.generatedAt,
            calcVersion: payload.calcVersion,
        });
    }

    private async upsert<T>(
        domain: string,
        write: SnapshotWrite<T>,
    ): Promise<string> {
        const envelope: SnapshotUserResult<T> = {
            managerId: null,
            paramsVersion: '',
            inputsHash: '',
            generatedAt: write.generatedAt,
            payload: write.payload,
        };
        const userResult = JSON.parse(
            JSON.stringify(envelope),
        ) as Prisma.JsonValue;
        const existing = pickActiveRecord(
            await this.aiService.findByDomainTypeKeys(domain, write.type, {
                activityIds: [write.key],
            }),
        );
        if (existing !== null) {
            await this.aiService.update(existing.id, {
                user_result: userResult,
                model: write.calcVersion,
            });
            return existing.id;
        }
        const created = await this.aiService.create({
            provider: AI_ANALYTICS_SNAPSHOT_PROVIDER,
            app: AI_ANALYTICS_SNAPSHOT_APP,
            model: write.calcVersion,
            type: write.type,
            status: AI_ANALYTICS_SNAPSHOT_STATUS.done,
            activity_id: write.key,
            domain,
            user_result: userResult,
        });
        return String(created.id);
    }
}
