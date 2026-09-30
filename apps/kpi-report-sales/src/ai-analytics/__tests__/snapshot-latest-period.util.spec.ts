import { AI_ANALYTICS_SNAPSHOT_TYPE } from '@lib/sales-ai-analytics';
import { Phase4SnapshotsLoader } from '../domain/loaders/phase4-snapshots.loader';
import { PortalModelLoader } from '../domain/loaders/portal-model.loader';
import type { AiAnalyticsSnapshotRecord } from '../store/ai-analytics-snapshot.types';
import {
    latestByPeriodKey,
    latestPortalByPeriod,
} from '../store/snapshot-latest-period.util';
import { qualityLinkSnapshot } from './fixtures/phase4-snapshots.fixture';

/**
 * «Последняя» запись по ключу периода (находки data-flow-5/6): догон
 * истории пишет старые месяцы ПОСЛЕ свежих, поэтому витрина, «Как
 * считаем», прогноз и шаги берут запись с максимальным месяцем, а не
 * последнюю записанную.
 */
const record = (
    id: string,
    periodKey: string,
    payload: unknown = {},
): AiAnalyticsSnapshotRecord =>
    ({ id, periodKey, managerId: null, payload }) as AiAnalyticsSnapshotRecord;

/** Порядок стора — по времени записи: догон записал 2025-10 последним. */
const BACKFILLED = [
    record('m-08', '2026-08'),
    record('m-07', '2026-07'),
    record('m-10', '2025-10'),
];

describe('latestByPeriodKey', () => {
    it('максимальный месяц, а не последняя записанная', () => {
        expect(latestByPeriodKey(BACKFILLED)?.id).toBe('m-08');
    });

    it('before — только месяцы строго раньше границы', () => {
        expect(latestByPeriodKey(BACKFILLED, '2026-08')?.id).toBe('m-07');
        expect(latestByPeriodKey(BACKFILLED, '2025-10')).toBeNull();
    });

    it('равные ключи — записанная позже', () => {
        expect(
            latestByPeriodKey([record('a', '2026-08'), record('b', '2026-08')])
                ?.id,
        ).toBe('b');
    });

    it('пусто — null', () => {
        expect(latestByPeriodKey([])).toBeNull();
    });
});

describe('потребители: запись по месяцу, а не по времени записи', () => {
    const store = (records: readonly AiAnalyticsSnapshotRecord[]) => ({
        findByKeys: jest.fn().mockResolvedValue(records),
        latest: jest.fn().mockResolvedValue(records[records.length - 1]),
    });

    it('latestPortalByPeriod: портальные записи окна, актуальные по ключу', async () => {
        const mock = store(BACKFILLED);
        const found = await latestPortalByPeriod(
            mock as never,
            'a.bitrix24.ru',
            AI_ANALYTICS_SNAPSHOT_TYPE.pool,
        );
        expect(found?.id).toBe('m-08');
        expect(mock.findByKeys).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            AI_ANALYTICS_SNAPSHOT_TYPE.pool,
            expect.objectContaining({ managerIds: [null], latestOnly: true }),
        );
    });

    it('витрина и «Как считаем»: связь качества за самый поздний месяц', async () => {
        const mock = store([
            record(
                'q-08',
                '2026-08',
                qualityLinkSnapshot({ monthKey: '2026-08' }),
            ),
            record(
                'q-10',
                '2025-10',
                qualityLinkSnapshot({ monthKey: '2025-10' }),
            ),
        ]);
        const latest = await new Phase4SnapshotsLoader(
            mock as never,
        ).loadLatest('a.bitrix24.ru');
        expect(latest.qualityLink?.monthKey).toBe('2026-08');
        expect(mock.latest).not.toHaveBeenCalled();
    });

    it('прогноз: модель последнего закрытого месяца, не старая и не из будущего', async () => {
        const mock = store(BACKFILLED);
        const loader = new PortalModelLoader(mock as never);

        expect((await loader.latestModel('a.bitrix24.ru', '2026-09'))?.id).toBe(
            'm-08',
        );
        expect((await loader.latestModel('a.bitrix24.ru', '2026-08'))?.id).toBe(
            'm-07',
        );
    });
});
