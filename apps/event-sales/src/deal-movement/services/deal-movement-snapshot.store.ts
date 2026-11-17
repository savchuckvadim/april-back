import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { AiService, pickActiveRecord } from '@lib/call-lib';
import {
    AI_ANALYTICS_SNAPSHOT_APP,
    AI_ANALYTICS_SNAPSHOT_PROVIDER,
    AI_ANALYTICS_SNAPSHOT_STATUS,
    AI_ANALYTICS_SNAPSHOT_TYPE,
    type DealMovementSnapshotPayload,
    type SnapshotUserResult,
} from '@lib/sales-ai-analytics';

/**
 * Дневной снимок движения сделок в ais: тип `ai-analytics-deal-movement`,
 * ключ (activity_id) — день портала, конверт снапшотов AI-аналитики
 * (`SnapshotUserResult`), провайдер и приложение — общие для снапшотов.
 * Повтор за тот же день (внеочередной счёт из админки) обновляет запись
 * на месте — у дня одна запись.
 *
 * `@Injectable` без bitrix-состояния: только AiService.
 */
@Injectable()
export class DealMovementSnapshotStore {
    constructor(private readonly aiService: AiService) {}

    async save(
        domain: string,
        payload: DealMovementSnapshotPayload,
    ): Promise<string> {
        const type = AI_ANALYTICS_SNAPSHOT_TYPE.dealMovement;
        const envelope: SnapshotUserResult<DealMovementSnapshotPayload> = {
            managerId: null,
            paramsVersion: '',
            inputsHash: '',
            generatedAt: payload.generatedAt,
            payload,
        };
        const userResult = JSON.parse(
            JSON.stringify(envelope),
        ) as Prisma.JsonValue;
        const existing = pickActiveRecord(
            await this.aiService.findByDomainTypeKeys(domain, type, {
                activityIds: [payload.day],
            }),
        );
        if (existing !== null) {
            await this.aiService.update(existing.id, {
                user_result: userResult,
                model: payload.calcVersion,
            });
            return existing.id;
        }
        const created = await this.aiService.create({
            provider: AI_ANALYTICS_SNAPSHOT_PROVIDER,
            app: AI_ANALYTICS_SNAPSHOT_APP,
            model: payload.calcVersion,
            type,
            status: AI_ANALYTICS_SNAPSHOT_STATUS.done,
            activity_id: payload.day,
            domain,
            user_result: userResult,
        });
        return String(created.id);
    }
}
