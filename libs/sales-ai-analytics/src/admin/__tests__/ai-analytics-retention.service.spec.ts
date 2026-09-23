import { AiEntityDto } from '@lib/call-lib';
import { AI_ANALYTICS_SNAPSHOT_TYPE } from '../../contracts/snapshot-kinds.const';
import { snapshotRetentionDays } from '../../contracts/snapshot-descriptors.const';
import { AiAnalyticsAdminSnapshotStore } from '../ai-analytics-admin-snapshot.store';
import {
    AI_ANALYTICS_RETENTION_DEFAULTS,
    AiAnalyticsRetentionService,
    RETENTION_RUN_STATUSES,
} from '../services/ai-analytics-retention.service';

const DOMAIN = 'april.bitrix24.ru';
const NOW = new Date('2026-09-22T04:30:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * DAY_MS);

function aisRecord(partial: {
    id: string;
    type: string;
    periodKey: string;
    status?: string;
    createdAt: Date;
}): AiEntityDto {
    return {
        id: partial.id,
        type: partial.type,
        domain: DOMAIN,
        activity_id: partial.periodKey,
        model: 'p2.4',
        status: partial.status ?? 'superseded',
        user_id: 0,
        tokens_count: 0,
        price: 0,
        createdAt: partial.createdAt,
        user_result: null,
    } as unknown as AiEntityDto;
}

function makeService(records: AiEntityDto[]) {
    const aiService = {
        findByDomainTypesInPeriod: jest.fn().mockResolvedValue(records),
    };
    const deleteByIds = jest.fn((ids: readonly string[]) =>
        Promise.resolve(ids.length),
    );
    const telegram = { sendMessage: jest.fn().mockResolvedValue(undefined) };
    const store = new AiAnalyticsAdminSnapshotStore(aiService as never);
    return {
        service: new AiAnalyticsRetentionService(
            store,
            { ...aiService, deleteByIds } as never,
            telegram as never,
        ),
        telegram,
        aiService,
        deleteByIds,
    };
}

/** Просроченные журналы прогонов: срок берётся из дескриптора типа. */
function expiredEtlRuns(count: number): AiEntityDto[] {
    const limit = snapshotRetentionDays(
        AI_ANALYTICS_SNAPSHOT_TYPE.etlRun,
    ) as number;
    return Array.from({ length: count }, (unused, index) =>
        aisRecord({
            id: `e${index}`,
            type: AI_ANALYTICS_SNAPSHOT_TYPE.etlRun,
            periodKey: `2020-01-${String(index + 1).padStart(2, '0')}`,
            createdAt: daysAgo(limit + 1 + index),
        }),
    );
}

describe('AiAnalyticsRetentionService', () => {
    it('dryRun по умолчанию: ничего не удаляет, статус planned, телеграм молчит', async () => {
        const { service, telegram } = makeService(expiredEtlRuns(3));
        const result = await service.run({ domain: DOMAIN, now: NOW });
        expect(AI_ANALYTICS_RETENTION_DEFAULTS.dryRun).toBe(true);
        expect(result.dryRun).toBe(true);
        expect(result.status).toBe(RETENTION_RUN_STATUSES.planned);
        expect(result.deleted).toBe(0);
        expect(result.total).toBe(3);
        expect(result.scanned).toBe(3);
        expect(telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('dryRun = false: записи удаляются, deleted = числу удалённых, одна строка в чат админов', async () => {
        const { service, telegram, deleteByIds } = makeService(
            expiredEtlRuns(2),
        );
        const result = await service.run({
            domain: DOMAIN,
            dryRun: false,
            now: NOW,
        });
        expect(result.status).toBe(RETENTION_RUN_STATUSES.deleted);
        expect(result.deleted).toBe(2);
        expect(deleteByIds).toHaveBeenCalledTimes(1);
        expect(deleteByIds.mock.calls[0][0]).toHaveLength(2);
        expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
        expect(telegram.sendMessage).toHaveBeenCalledWith(result.summary);
        expect(result.summary).toContain(DOMAIN);
        expect(result.summary).toContain('под удаление 2');
    });

    it('строка сводки несёт домен, режим, счётчики и топ типов', async () => {
        const { service } = makeService(expiredEtlRuns(4));
        const result = await service.run({ domain: DOMAIN, now: NOW });
        expect(result.summary).toBe(
            `Ретенция AI-аналитики ${DOMAIN}: расчёт (dryRun); ` +
                'просмотрено 4, под удаление 4; по типам: ' +
                `${AI_ANALYTICS_SNAPSHOT_TYPE.etlRun} 4`,
        );
    });

    it('sampleLimit режет примеры, но не счётчики', async () => {
        const { service } = makeService(expiredEtlRuns(10));
        const result = await service.run({
            domain: DOMAIN,
            sampleLimit: 3,
            now: NOW,
        });
        expect(result.total).toBe(10);
        expect(result.sample).toHaveLength(3);
    });

    it('чужие типы в ais (не из реестра) в план не попадают', async () => {
        const { service } = makeService([
            ...expiredEtlRuns(1),
            aisRecord({
                id: 'alien',
                type: 'call-report',
                periodKey: 'x',
                createdAt: daysAgo(5000),
            }),
        ]);
        const result = await service.run({ domain: DOMAIN, now: NOW });
        // Прочитаны обе строки, но политика видит только известный тип.
        expect(result.scanned).toBe(1);
        expect(result.total).toBe(1);
    });

    it('отказ телеграм-канала ручку не роняет', async () => {
        const { service, telegram } = makeService(expiredEtlRuns(1));
        telegram.sendMessage.mockRejectedValueOnce(new Error('нет сети'));
        await expect(
            service.run({ domain: DOMAIN, dryRun: false, now: NOW }),
        ).resolves.toMatchObject({ total: 1, deleted: 1 });
    });

    it('телеграма нет (optional-провайдер) — запуск всё равно проходит', async () => {
        const aiService = {
            findByDomainTypesInPeriod: jest
                .fn()
                .mockResolvedValue(expiredEtlRuns(1)),
            deleteByIds: jest.fn().mockResolvedValue(1),
        };
        const service = new AiAnalyticsRetentionService(
            new AiAnalyticsAdminSnapshotStore(aiService as never),
            aiService as never,
        );
        await expect(
            service.run({ domain: DOMAIN, dryRun: false, now: NOW }),
        ).resolves.toMatchObject({
            status: RETENTION_RUN_STATUSES.deleted,
            deleted: 1,
        });
    });

    it('сервиса записей нет — честный delete-not-available без удаления', async () => {
        const aiService = {
            findByDomainTypesInPeriod: jest
                .fn()
                .mockResolvedValue(expiredEtlRuns(1)),
        };
        const service = new AiAnalyticsRetentionService(
            new AiAnalyticsAdminSnapshotStore(aiService as never),
        );
        await expect(
            service.run({ domain: DOMAIN, dryRun: false, now: NOW }),
        ).resolves.toMatchObject({
            status: RETENTION_RUN_STATUSES.deleteNotAvailable,
            deleted: 0,
        });
    });
});
