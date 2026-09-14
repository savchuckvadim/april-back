import {
    AI_ANALYTICS_SNAPSHOT_APP,
    AI_ANALYTICS_SNAPSHOT_LOOKBACK_DAYS,
    AI_ANALYTICS_SNAPSHOT_PROVIDER,
    AI_ANALYTICS_SNAPSHOT_STATUS,
    AI_ANALYTICS_SNAPSHOT_TYPE,
    AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT,
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

const ids = (records: readonly { id: string }[]): string[] =>
    records.map(record => record.id);

describe('AiAnalyticsSnapshotStore (снапшоты Фазы 2 в ais)', () => {
    it('upsert пишет запись и помечает прошлую версию ключа superseded', async () => {
        const source = envelope(
            AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            '2026-09',
            '10',
        );
        // Прошлая версия ключа посчитана по другим входам — она замещается.
        const { store, aiService } = makeStore([
            row('1', new Date('2026-09-06T03:45:00.000Z'), {
                ...source,
                inputsHash: 'hash-0',
            }),
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
        expect(result).toEqual({
            id: '9001',
            supersededIds: ['1'],
            written: 1,
        });
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
        expect(result).toEqual({
            id: '9001',
            supersededIds: [],
            written: 1,
        });
        const [created] = aiService.create.mock.calls[0];
        expect(created).not.toHaveProperty('user_id');
    });

    it('повторный upsert с той же сигнатурой идемпотентен, force пишет заново', async () => {
        const source = envelope(
            AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            '2026-09',
            '10',
        );
        const { store, aiService } = makeStore([
            row('1', new Date('2026-09-05T03:45:00.000Z'), {
                ...source,
                inputsHash: 'hash-0',
            }),
            row('2', new Date('2026-09-06T03:45:00.000Z'), source),
        ]);

        // Актуальная запись '2' уже несёт inputsHash + paramsVersion +
        // calcVersion повтора: копия не создаётся, отдаётся её id.
        const repeated = await store.upsert({
            ...source,
            generatedAt: '2026-09-07T03:45:00.000Z',
            payload: { n: 2 },
        });
        expect(repeated).toEqual({ id: '2', supersededIds: [], written: 0 });
        expect(aiService.create).not.toHaveBeenCalled();
        expect(aiService.update).not.toHaveBeenCalled();

        // Смена любой части сигнатуры — обычная запись с замещением.
        const changed = await store.upsert({
            ...source,
            paramsVersion: 'params-2',
        });
        expect(changed).toEqual({
            id: '9001',
            supersededIds: ['1', '2'],
            written: 1,
        });

        // force — принудительный пересчёт при той же сигнатуре.
        aiService.create.mockClear();
        aiService.update.mockClear();
        const forced = await store.upsert(source, { force: true });
        expect(forced).toEqual({
            id: '9001',
            supersededIds: ['1', '2'],
            written: 1,
        });
        expect(aiService.create).toHaveBeenCalledTimes(1);
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
        expect(ids(byManager)).toEqual(['1']);
        expect(byManager[0].payload).toEqual({ n: 1 });
        expect(byManager[0].managerId).toBe('10');

        const withSuperseded = await store.findByKeys(
            DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            { periodKeys: ['2026-09'], includeSuperseded: true },
        );
        expect(ids(withSuperseded)).toEqual(['1', '2', '3']);
        expect(aiService.findByDomainTypesInPeriod).not.toHaveBeenCalled();
    });

    it('findByKeys без ключей периодов читает окно created_at', async () => {
        const { store, aiService } = makeStore([]);
        await store.findByKeys(DOMAIN, AI_ANALYTICS_SNAPSHOT_TYPE.etlRun, {
            now: NOW,
            limit: 10,
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

    it('без ключей периодов нужен limit — иначе ошибка до запроса', async () => {
        const { store, aiService } = makeStore([]);
        const type = AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth;

        await expect(
            store.findByKeys(DOMAIN, type, { managerIds: ['10'] }),
        ).rejects.toThrow(/без periodKeys обязателен limit/);
        await expect(
            store.findByKeys(DOMAIN, type, { limit: 0 }),
        ).rejects.toThrow(/limit \(целое > 0\)/);
        await expect(
            store.findByKeys(DOMAIN, type, {
                periodKeys: ['2026-09'],
                limit: 1.5,
            }),
        ).rejects.toThrow(/limit/);
        expect(aiService.findByDomainTypesInPeriod).not.toHaveBeenCalled();
        expect(aiService.findByDomainTypeKeys).not.toHaveBeenCalled();
    });

    it('limit ограничивает сырые строки самыми свежими, фильтры — поверх', async () => {
        const source = envelope(
            AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek,
            '2026-W36',
            '10',
        );
        const { store } = makeStore([
            row('1', new Date('2026-09-01T03:45:00.000Z'), source),
            row('2', new Date('2026-09-02T03:45:00.000Z'), source),
            row(
                '3',
                new Date('2026-09-03T03:45:00.000Z'),
                source,
                AI_ANALYTICS_SNAPSHOT_STATUS.superseded,
            ),
        ]);

        // Две самые свежие строки — '2' и superseded '3'; статус
        // отсеивает '3' уже после границы, как сделал бы take репозитория.
        const capped = await store.findByKeys(
            DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek,
            { now: NOW, limit: 2 },
        );
        expect(ids(capped)).toEqual(['2']);

        const all = await store.findByKeys(
            DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek,
            { now: NOW, limit: AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT },
        );
        expect(ids(all)).toEqual(['1', '2']);
    });

    it('latestOnly оставляет запись с максимальным id на ключ период + менеджер', async () => {
        const m10sep = envelope(
            AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            '2026-09',
            '10',
        );
        const m20sep = envelope(
            AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            '2026-09',
            '20',
        );
        const m10aug = envelope(
            AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            '2026-08',
            '10',
        );
        const sameMoment = new Date('2026-08-01T03:45:00.000Z');
        const { store } = makeStore([
            row('1', new Date('2026-09-05T03:45:00.000Z'), m10sep),
            row('2', new Date('2026-09-06T03:45:00.000Z'), m10sep),
            row('3', new Date('2026-09-06T03:45:00.000Z'), m20sep),
            // Один момент created_at — решает больший id.
            row('4', sameMoment, m10aug),
            row('5', sameMoment, m10aug),
        ]);

        const latestOnly = await store.findByKeys(
            DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            { periodKeys: ['2026-08', '2026-09'], latestOnly: true },
        );
        expect(ids(latestOnly)).toEqual(['5', '2', '3']);

        const plain = await store.findByKeys(
            DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            { periodKeys: ['2026-08', '2026-09'] },
        );
        expect(ids(plain)).toEqual(['4', '5', '1', '2', '3']);
    });

    it('latestModel: по monthKey — запись ключа, без него — последняя модель', async () => {
        const model = (monthKey: string) =>
            envelope(AI_ANALYTICS_SNAPSHOT_TYPE.portalModel, monthKey, null);
        const { store, aiService } = makeStore([
            row('1', new Date('2026-08-03T04:00:00.000Z'), model('2026-08')),
            row('2', new Date('2026-09-03T04:00:00.000Z'), model('2026-09')),
            row(
                '3',
                new Date('2026-09-04T04:00:00.000Z'),
                model('2026-09'),
                AI_ANALYTICS_SNAPSHOT_STATUS.superseded,
            ),
        ]);

        const ofMonth = await store.latestModel(DOMAIN, '2026-09');
        expect(ofMonth?.id).toBe('2');
        expect(ofMonth?.periodKey).toBe('2026-09');
        expect(aiService.findByDomainTypeKeys).toHaveBeenCalledWith(
            DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.portalModel,
            { activityIds: ['2026-09'] },
        );
        expect(aiService.findByDomainTypesInPeriod).not.toHaveBeenCalled();

        await expect(store.latestModel(DOMAIN, '2026-07')).resolves.toBeNull();

        const overall = await store.latestModel(DOMAIN);
        expect(overall?.id).toBe('2');
        expect(aiService.findByDomainTypesInPeriod).toHaveBeenCalledTimes(1);
    });

    it('findManagerMonths: одна актуальная запись на менеджер-месяц в пределах limit', async () => {
        const month = (monthKey: string, managerId: string) =>
            envelope(
                AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
                monthKey,
                managerId,
            );
        const { store, aiService } = makeStore([
            row(
                '1',
                new Date('2026-08-31T04:00:00.000Z'),
                month('2026-08', '10'),
            ),
            row(
                '2',
                new Date('2026-09-05T04:00:00.000Z'),
                month('2026-09', '10'),
                AI_ANALYTICS_SNAPSHOT_STATUS.superseded,
            ),
            row(
                '3',
                new Date('2026-09-06T04:00:00.000Z'),
                month('2026-09', '10'),
            ),
            row(
                '4',
                new Date('2026-09-06T04:00:00.000Z'),
                month('2026-09', '20'),
            ),
        ]);
        const monthKeys = ['2026-08', '2026-09'];

        const all = await store.findManagerMonths(DOMAIN, monthKeys, {
            limit: AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT,
        });
        expect(ids(all)).toEqual(['1', '3', '4']);
        expect(aiService.findByDomainTypeKeys).toHaveBeenCalledWith(
            DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            { activityIds: monthKeys },
        );

        // limit 3 отрезает самую старую строку '1' ещё до фильтров.
        const capped = await store.findManagerMonths(DOMAIN, monthKeys, {
            limit: 3,
        });
        expect(ids(capped)).toEqual(['3', '4']);

        const one = await store.findManagerMonths(DOMAIN, monthKeys, {
            limit: AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT,
            managerIds: ['20'],
        });
        expect(ids(one)).toEqual(['4']);

        aiService.findByDomainTypeKeys.mockClear();
        await expect(
            store.findManagerMonths(DOMAIN, [], { limit: 10 }),
        ).resolves.toEqual([]);
        expect(aiService.findByDomainTypeKeys).not.toHaveBeenCalled();
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
