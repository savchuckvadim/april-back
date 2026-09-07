import {
    AI_ANALYTICS_SNAPSHOT_APP,
    AI_ANALYTICS_SNAPSHOT_LOOKBACK_DAYS,
    AI_ANALYTICS_SNAPSHOT_PROVIDER,
    AI_ANALYTICS_SNAPSHOT_STATUS,
    AI_ANALYTICS_SNAPSHOT_TYPE,
    SnapshotEnvelope,
    snapshotRetentionDays,
    snapshotRetentionRecords,
} from '@lib/sales-ai-analytics';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import { toAisRecord } from '../store/snapshot-serialize.util';

const DOMAIN = 'd.bitrix24.ru';
const NOW = new Date('2026-09-07T03:45:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

type SnapshotType =
    (typeof AI_ANALYTICS_SNAPSHOT_TYPE)[keyof typeof AI_ANALYTICS_SNAPSHOT_TYPE];

function envelope(
    type: SnapshotType,
    periodKey: string,
    managerId: string | null,
    payload: Record<string, number> = { n: 1 },
): SnapshotEnvelope<Record<string, number>> {
    return {
        domain: DOMAIN,
        type,
        periodKey,
        managerId,
        calcVersion: 'sam-1.0.0',
        paramsVersion: 'params-1',
        inputsHash: 'hash-1',
        generatedAt: NOW.toISOString(),
        payload,
    };
}

/** Строка ais из конверта: id и created_at, как их отдаёт AiEntityDto. */
function row(
    id: string,
    createdAt: Date,
    source: SnapshotEnvelope<Record<string, number>>,
    status: string = AI_ANALYTICS_SNAPSHOT_STATUS.done,
): Record<string, unknown> {
    const record = toAisRecord(source);
    return {
        id,
        createdAt,
        type: record.type,
        activity_id: record.activity_id,
        model: record.model,
        status,
        domain: record.domain,
        user_id: record.user_id ?? 0,
        user_result: JSON.parse(JSON.stringify(record.user_result)) as unknown,
    };
}

function makeStore(rows: Record<string, unknown>[] = []) {
    const aiService = {
        create: jest.fn((input: Record<string, unknown>) =>
            Promise.resolve({ id: '9001', ...input }),
        ),
        update: jest.fn((id: string) => Promise.resolve({ id })),
        findByDomainTypeKeys: jest.fn(
            (
                _domain: string,
                _type: string,
                keys: { activityIds?: string[] },
            ) =>
                Promise.resolve(
                    rows.filter(entry =>
                        keys.activityIds?.includes(String(entry.activity_id)),
                    ),
                ),
        ),
        findByDomainTypesInPeriod: jest.fn().mockResolvedValue(rows),
    };
    return {
        store: new AiAnalyticsSnapshotStore(aiService as never),
        aiService,
    };
}

describe('AiAnalyticsSnapshotStore (снапшоты Фазы 2 в ais)', () => {
    it('upsert пишет запись и помечает прошлую версию ключа superseded', async () => {
        const source = envelope(
            AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            '2026-09',
            '10',
        );
        const { store, aiService } = makeStore([
            row('1', new Date('2026-09-06T03:45:00.000Z'), source),
        ]);

        const result = await store.upsert(source);

        expect(aiService.findByDomainTypeKeys).toHaveBeenCalledWith(
            DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            { activityIds: ['2026-09'] },
        );
        expect(aiService.update).toHaveBeenCalledWith('1', {
            status: AI_ANALYTICS_SNAPSHOT_STATUS.superseded,
        });
        expect(result).toEqual({ id: '9001', supersededIds: ['1'] });
        expect(aiService.create).toHaveBeenCalledWith({
            provider: AI_ANALYTICS_SNAPSHOT_PROVIDER,
            app: AI_ANALYTICS_SNAPSHOT_APP,
            type: AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            activity_id: '2026-09',
            model: 'sam-1.0.0',
            status: AI_ANALYTICS_SNAPSHOT_STATUS.done,
            domain: DOMAIN,
            user_id: 10,
            user_result: {
                managerId: '10',
                paramsVersion: 'params-1',
                inputsHash: 'hash-1',
                generatedAt: NOW.toISOString(),
                payload: { n: 1 },
            },
        });
    });

    it('upsert портального снапшота: без user_id, чужие ключи не трогает', async () => {
        const portal = envelope(
            AI_ANALYTICS_SNAPSHOT_TYPE.portalModel,
            '2026-09',
            null,
        );
        const { store, aiService } = makeStore([
            row(
                '1',
                new Date('2026-09-06T03:45:00.000Z'),
                envelope(
                    AI_ANALYTICS_SNAPSHOT_TYPE.portalModel,
                    '2026-08',
                    null,
                ),
            ),
        ]);

        const result = await store.upsert(portal);

        expect(aiService.update).not.toHaveBeenCalled();
        expect(result.supersededIds).toEqual([]);
        const [created] = aiService.create.mock.calls[0];
        expect(created).not.toHaveProperty('user_id');
    });

    it('findByKeys фильтрует по менеджеру, ключу и статусу', async () => {
        const first = envelope(
            AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            '2026-09',
            '10',
        );
        const other = envelope(
            AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            '2026-09',
            '20',
        );
        const { store, aiService } = makeStore([
            row('1', new Date('2026-09-05T03:45:00.000Z'), first),
            row(
                '2',
                new Date('2026-09-06T03:45:00.000Z'),
                first,
                AI_ANALYTICS_SNAPSHOT_STATUS.superseded,
            ),
            row('3', new Date('2026-09-06T03:45:00.000Z'), other),
            {
                id: '4',
                createdAt: NOW,
                type: AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
                activity_id: '2026-09',
                domain: DOMAIN,
                status: AI_ANALYTICS_SNAPSHOT_STATUS.done,
            },
        ]);

        const byManager = await store.findByKeys(
            DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            { periodKeys: ['2026-09'], managerIds: ['10'] },
        );
        expect(byManager.map(record => record.id)).toEqual(['1']);
        expect(byManager[0].payload).toEqual({ n: 1 });
        expect(byManager[0].managerId).toBe('10');

        const withSuperseded = await store.findByKeys(
            DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            { periodKeys: ['2026-09'], includeSuperseded: true },
        );
        expect(withSuperseded.map(record => record.id)).toEqual([
            '1',
            '2',
            '3',
        ]);
        expect(aiService.findByDomainTypesInPeriod).not.toHaveBeenCalled();
    });

    it('findByKeys без ключей периодов читает окно created_at', async () => {
        const { store, aiService } = makeStore([]);
        await store.findByKeys(DOMAIN, AI_ANALYTICS_SNAPSHOT_TYPE.etlRun, {
            now: NOW,
        });
        expect(aiService.findByDomainTypeKeys).not.toHaveBeenCalled();
        const [domain, types, from, to] = aiService.findByDomainTypesInPeriod
            .mock.calls[0] as [string, string[], Date, Date];
        expect(domain).toBe(DOMAIN);
        expect(types).toEqual([AI_ANALYTICS_SNAPSHOT_TYPE.etlRun]);
        expect(from).toEqual(
            new Date(
                NOW.getTime() - AI_ANALYTICS_SNAPSHOT_LOOKBACK_DAYS * DAY_MS,
            ),
        );
        expect(to).toEqual(new Date(NOW.getTime() + DAY_MS));
    });

    it('latest отдаёт последний актуальный снапшот менеджера', async () => {
        const source = envelope(
            AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek,
            '2026-W36',
            '10',
        );
        const { store } = makeStore([
            row('1', new Date('2026-09-01T03:45:00.000Z'), source),
            row('2', new Date('2026-09-07T03:45:00.000Z'), source),
            row(
                '3',
                new Date('2026-09-08T03:45:00.000Z'),
                source,
                AI_ANALYTICS_SNAPSHOT_STATUS.superseded,
            ),
            row(
                '4',
                new Date('2026-09-09T03:45:00.000Z'),
                envelope(
                    AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek,
                    '2026-W36',
                    '20',
                ),
            ),
        ]);

        const latest = await store.latest(
            DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek,
            '10',
            { now: NOW },
        );
        expect(latest?.id).toBe('2');

        const any = await store.latest(
            DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek,
            undefined,
            { now: NOW },
        );
        expect(any?.id).toBe('4');
    });

    it('latest без записей → null', async () => {
        const { store } = makeStore([]);
        await expect(
            store.latest(DOMAIN, AI_ANALYTICS_SNAPSHOT_TYPE.portalModel),
        ).resolves.toBeNull();
    });

    it('prune оставляет N последних записей на менеджера', async () => {
        const source = envelope(
            AI_ANALYTICS_SNAPSHOT_TYPE.style,
            '2026-09',
            '10',
        );
        const { store, aiService } = makeStore([
            row('1', new Date('2026-06-01T03:45:00.000Z'), source),
            row('2', new Date('2026-07-01T03:45:00.000Z'), source),
            row('3', new Date('2026-08-01T03:45:00.000Z'), source),
        ]);

        const result = await store.prune(
            DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.style,
            2,
            { now: NOW },
        );

        expect(result).toEqual({ retiredIds: ['1'], kept: 2 });
        expect(aiService.update).toHaveBeenCalledTimes(1);
        expect(aiService.update).toHaveBeenCalledWith('1', {
            status: AI_ANALYTICS_SNAPSHOT_STATUS.superseded,
        });
    });

    it('prune без keep берёт ретенцию из дескриптора: записи и дни', async () => {
        expect(snapshotRetentionRecords(AI_ANALYTICS_SNAPSHOT_TYPE.style)).toBe(
            12,
        );
        expect(snapshotRetentionDays(AI_ANALYTICS_SNAPSHOT_TYPE.etlRun)).toBe(
            90,
        );

        const style = envelope(
            AI_ANALYTICS_SNAPSHOT_TYPE.style,
            '2026-09',
            '10',
        );
        const byRecords = makeStore(
            Array.from({ length: 13 }, (_, index) =>
                row(
                    String(index + 1),
                    new Date(NOW.getTime() - (13 - index) * DAY_MS),
                    style,
                ),
            ),
        );
        const recordsResult = await byRecords.store.prune(
            DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.style,
            undefined,
            { now: NOW },
        );
        expect(recordsResult).toEqual({ retiredIds: ['1'], kept: 12 });

        const etl = envelope(
            AI_ANALYTICS_SNAPSHOT_TYPE.etlRun,
            '2026-09-04',
            null,
        );
        const byDays = makeStore([
            row('1', new Date(NOW.getTime() - 100 * DAY_MS), etl),
            row('2', new Date(NOW.getTime() - 10 * DAY_MS), etl),
        ]);
        const daysResult = await byDays.store.prune(
            DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.etlRun,
            undefined,
            { now: NOW },
        );
        expect(daysResult).toEqual({ retiredIds: ['1'], kept: 1 });
    });

    it('prune не трогает типы с бессрочной ретенцией', async () => {
        const feedback = envelope(
            AI_ANALYTICS_SNAPSHOT_TYPE.feedback,
            '2026-09-04',
            '10',
        );
        const { store, aiService } = makeStore([
            row('1', new Date('2020-01-01T00:00:00.000Z'), feedback),
        ]);
        const result = await store.prune(
            DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.feedback,
            undefined,
            { now: NOW },
        );
        expect(result).toEqual({ retiredIds: [], kept: 1 });
        expect(aiService.update).not.toHaveBeenCalled();
    });
});
