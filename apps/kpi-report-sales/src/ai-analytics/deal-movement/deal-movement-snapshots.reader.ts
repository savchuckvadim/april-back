import { Injectable } from '@nestjs/common';
import { AiService, pickActiveRecord } from '@lib/call-lib';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    DEAL_MOVEMENT_DEALS_KEY,
    readDealMovementDealsSnapshot,
    readDealMovementSnapshot,
    type DealMovementDealsSnapshotPayload,
    type DealMovementSnapshotView,
} from '@lib/sales-ai-analytics';

/** Запись ais в объёме чтения: ключ, статус и нагрузка в конверте. */
interface AisRecordView {
    id: string;
    status?: string | null;
    activity_id: string;
    user_result: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Нагрузка из конверта снапшота (`SnapshotUserResult`). */
const payloadOf = (record: AisRecordView): unknown =>
    isRecord(record.user_result) ? record.user_result.payload : null;

/** Действующая запись на каждый ключ (activity_id). */
function activeByKey<T extends AisRecordView>(records: readonly T[]): T[] {
    const byKey = new Map<string, T[]>();
    for (const record of records) {
        const list = byKey.get(record.activity_id) ?? [];
        list.push(record);
        byKey.set(record.activity_id, list);
    }
    return [...byKey.values()].flatMap(list => {
        const active = pickActiveRecord(list);
        return active === null ? [] : [active];
    });
}

/**
 * Записи движения сделок, которые пишет ночной счёт event-sales: дневные
 * снимки за список дней и список проблемных сделок последней ночи. Только
 * БД (ais) — Битрикс не вызывается. Старые снимки (форма 1) читаются без
 * сумм и разреза; чужие и битые записи пропускаются.
 *
 * `@Injectable` без bitrix-состояния: только AiService.
 */
@Injectable()
export class DealMovementSnapshotsReader {
    constructor(private readonly aiService: AiService) {}

    /** Снимки за дни 'YYYY-MM-DD' (каких нет — пропущены), по дням. */
    async nights(
        domain: string,
        days: readonly string[],
    ): Promise<DealMovementSnapshotView[]> {
        if (days.length === 0) return [];
        const records = await this.aiService.findByDomainTypeKeys(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.dealMovement,
            { activityIds: [...days] },
        );
        return activeByKey(records)
            .flatMap(record => {
                const view = readDealMovementSnapshot(payloadOf(record));
                return view === null ? [] : [view];
            })
            .sort((a, b) => a.day.localeCompare(b.day));
    }

    /** Проблемные сделки последней ночи; записи ещё нет — null. */
    async problemDeals(
        domain: string,
    ): Promise<DealMovementDealsSnapshotPayload | null> {
        const records = await this.aiService.findByDomainTypeKeys(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.dealMovementDeals,
            { activityIds: [DEAL_MOVEMENT_DEALS_KEY] },
        );
        const active = pickActiveRecord(records);
        return active === null
            ? null
            : readDealMovementDealsSnapshot(payloadOf(active));
    }
}
