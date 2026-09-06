import { TranscriptionStoreService } from '../services/transcription.store.service';

const prismaRow = {
    id: BigInt(42),
    dedup_key: 'test.bitrix24.ru:781614',
    domain: 'test.bitrix24.ru',
    activity_id: '781614',
    call_id: 'ext_1',
    call_started_at: new Date('2026-07-21T10:00:00Z'),
    provider: 'yandex',
    status: 'done',
    text: 'привет',
    duration: '700',
    entity_type: 'deal',
    entity_id: '123',
    user_id: '7',
    created_at: new Date('2026-07-21T10:30:00Z'),
    updated_at: new Date('2026-07-21T10:40:00Z'),
};

/** Строка лёгкой выборки: только колонки select, без text. */
const liteRow = {
    id: BigInt(42),
    domain: 'test.bitrix24.ru',
    call_started_at: new Date('2026-07-21T10:00:00Z'),
    duration: '700',
    entity_type: 'deal',
    entity_id: '123',
    user_id: '7',
    created_at: new Date('2026-07-21T10:30:00Z'),
};

const makeRepo = () => ({
    upsertPipeline: jest.fn().mockResolvedValue(prismaRow),
    updatePipeline: jest.fn().mockResolvedValue(prismaRow),
    findBusyDedupKeys: jest.fn().mockResolvedValue(['a:1']),
    reanimateStaleProcessing: jest.fn().mockResolvedValue(3),
    findDonePipeline: jest.fn().mockResolvedValue([prismaRow]),
    findById: jest.fn().mockResolvedValue(prismaRow),
    findDonePipelineInPeriodLite: jest.fn().mockResolvedValue([liteRow]),
});

describe('TranscriptionStoreService (pipeline)', () => {
    it('startPipeline делает upsert и маппит строку в pipeline-view', async () => {
        const repo = makeRepo();
        const service = new TranscriptionStoreService(repo as never);
        const view = await service.startPipeline({
            dedupKey: 'test.bitrix24.ru:781614',
            domain: 'test.bitrix24.ru',
            activityId: '781614',
            entityType: 'deal',
            entityId: '123',
            app: 'call-report',
        });
        expect(repo.upsertPipeline).toHaveBeenCalled();
        expect(view.id).toBe('42');
        expect(view.dedupKey).toBe('test.bitrix24.ru:781614');
        expect(view.activityId).toBe('781614');
        expect(view.entityId).toBe('123');
    });

    it('filterBusyDedupKeys возвращает Set занятых ключей', async () => {
        const repo = makeRepo();
        const service = new TranscriptionStoreService(repo as never);
        const busy = await service.filterBusyDedupKeys(['a:1', 'a:2']);
        // 'queued' — бронь сканера: звонок в очереди тоже занят.
        expect(repo.findBusyDedupKeys).toHaveBeenCalledWith(
            ['a:1', 'a:2'],
            ['queued', 'processing', 'done'],
        );
        expect(busy.has('a:1')).toBe(true);
        expect(busy.has('a:2')).toBe(false);
    });

    it('reanimateStaleProcessing проксирует порог в репозиторий', async () => {
        const repo = makeRepo();
        const service = new TranscriptionStoreService(repo as never);
        const olderThan = new Date('2026-07-21T09:00:00Z');
        const count = await service.reanimateStaleProcessing(olderThan);
        expect(repo.reanimateStaleProcessing).toHaveBeenCalledWith(olderThan);
        expect(count).toBe(3);
    });

    it('findPipelineById бросает NotFound при отсутствии строки', async () => {
        const repo = makeRepo();
        repo.findById.mockResolvedValue(null);
        const service = new TranscriptionStoreService(repo as never);
        await expect(service.findPipelineById('99')).rejects.toThrow(
            'Transcription not found',
        );
    });

    it('findDoneInPeriodLite маппит лёгкую строку без текста транскрипта', async () => {
        const repo = makeRepo();
        const service = new TranscriptionStoreService(repo as never);
        const from = new Date('2026-07-01T00:00:00Z');
        const to = new Date('2026-07-31T23:59:59Z');
        const rows = await service.findDoneInPeriodLite(
            'test.bitrix24.ru',
            from,
            to,
        );
        expect(repo.findDonePipelineInPeriodLite).toHaveBeenCalledWith(
            'test.bitrix24.ru',
            from,
            to,
        );
        expect(rows).toEqual([
            {
                id: '42',
                domain: 'test.bitrix24.ru',
                callStartedAt: liteRow.call_started_at,
                durationSec: '700',
                entityType: 'deal',
                entityId: '123',
                userId: '7',
                createdAt: liteRow.created_at,
            },
        ]);
        expect(rows[0]).not.toHaveProperty('text');
    });
});
