/**
 * «Последняя» портальная запись по КЛЮЧУ периода, а не по времени записи.
 *
 * Догон истории пишет месяцы от свежих к старым (и повтор с
 * `forceRefresh` переписывает старые месяцы позже новых), поэтому
 * `latest()` по `created_at` после догона отдаёт самый старый месяц, а в
 * догоне прошлого месяца — запись из будущего. Витрина, «Как считаем»,
 * прогноз и шаги конвейера берут запись с максимальным ключом периода
 * (строго раньше `before`, если граница задана).
 *
 * Не инжектируемый хелпер поверх стора: окно `created_at` с тем же
 * лимитом, что у `latest()`.
 */
import {
    AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT,
    type AiAnalyticsSnapshotType,
} from '@lib/sales-ai-analytics';
import type { AiAnalyticsSnapshotStore } from './ai-analytics-snapshot.store';
import type { AiAnalyticsSnapshotRecord } from './ai-analytics-snapshot.types';

/** Часть стора, нужная выборке. */
export type SnapshotKeyFinder = Pick<AiAnalyticsSnapshotStore, 'findByKeys'>;

/**
 * Запись с максимальным ключом периода (строго меньше `before`, если он
 * задан); при равных ключах — записанная позже (порядок стора).
 */
export function latestByPeriodKey(
    records: readonly AiAnalyticsSnapshotRecord[],
    before?: string,
): AiAnalyticsSnapshotRecord | null {
    let best: AiAnalyticsSnapshotRecord | null = null;
    for (const record of records) {
        if (before !== undefined && record.periodKey >= before) continue;
        if (best === null || record.periodKey >= best.periodKey) {
            best = record;
        }
    }

    return best;
}

/**
 * Портальная запись типа с максимальным ключом периода в окне `created_at`
 * (`before` — только ключи строго раньше). Нет записей — null.
 */
export async function latestPortalByPeriod(
    store: SnapshotKeyFinder,
    domain: string,
    type: AiAnalyticsSnapshotType,
    before?: string,
): Promise<AiAnalyticsSnapshotRecord | null> {
    const records = await store.findByKeys(domain, type, {
        managerIds: [null],
        latestOnly: true,
        limit: AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT,
    });

    return latestByPeriodKey(records, before);
}
