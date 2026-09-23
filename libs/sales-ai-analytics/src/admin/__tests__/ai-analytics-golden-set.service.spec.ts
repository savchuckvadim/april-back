import { AiEntityDto } from '@lib/call-lib';
import { AI_ANALYTICS_SNAPSHOT_TYPE } from '../../contracts/snapshot-kinds.const';
import { GoldenReport } from '../../contracts/golden-report.types';
import { AiAnalyticsAdminSnapshotStore } from '../ai-analytics-admin-snapshot.store';
import {
    AiAnalyticsGoldenSetService,
    GOLDEN_SET_MESSAGES,
} from '../services/ai-analytics-golden-set.service';

const DOMAIN = 'april.bitrix24.ru';

/** Известный отчёт согласия: 312 пар, квота 300 — в квоту не уложились. */
function goldenReport(promptVersion: string): GoldenReport {
    return {
        promptVersion,
        pairs: 312,
        budget: { quota: 300, withinQuota: false },
        categories: [],
        scales: [],
        objections: {
            pairsWithObjections: 0,
            micro: { f1: 1, precision: 1, recall: 1, tp: 0, fp: 0, fn: 0 },
            byCode: [],
        },
        sigmaLlm: {
            scale: 'weightedScore',
            measured: 0.62,
            n: 312,
            minPairs: 100,
            configured: 0.8,
            source: 'measured',
            value: 0.62,
        },
    } as GoldenReport;
}

function record(partial: {
    id: string;
    periodKey: string;
    payload: unknown;
    createdAt: Date;
}): AiEntityDto {
    return {
        id: partial.id,
        type: AI_ANALYTICS_SNAPSHOT_TYPE.goldenReport,
        domain: DOMAIN,
        activity_id: partial.periodKey,
        model: 'p3.1',
        status: 'done',
        user_id: 0,
        tokens_count: 0,
        price: 0,
        createdAt: partial.createdAt,
        user_result: {
            managerId: null,
            paramsVersion: 'r7',
            inputsHash: 'h',
            generatedAt: partial.createdAt.toISOString(),
            payload: partial.payload,
        },
    } as unknown as AiEntityDto;
}

function makeService(records: AiEntityDto[]) {
    const aiService = {
        findByDomainTypesInPeriod: jest.fn().mockResolvedValue(records),
    };
    return new AiAnalyticsGoldenSetService(
        new AiAnalyticsAdminSnapshotStore(aiService as never),
    );
}

describe('AiAnalyticsGoldenSetService', () => {
    it('отдаёт шапки отчётов, свежие первыми', async () => {
        const service = makeService([
            record({
                id: 'old',
                periodKey: 'aaaa1111',
                payload: goldenReport('v3.0'),
                createdAt: new Date('2026-08-01T00:00:00.000Z'),
            }),
            record({
                id: 'fresh',
                periodKey: 'bbbb2222',
                payload: goldenReport('v3.1'),
                createdAt: new Date('2026-09-18T00:00:00.000Z'),
            }),
        ]);
        const result = await service.list(DOMAIN);
        expect(result.entries.map(entry => entry.id)).toEqual(['fresh', 'old']);
        expect(result.total).toBe(2);
        expect(result.skipped).toBe(0);
        expect(result.entries[0]).toEqual({
            id: 'fresh',
            periodKey: 'bbbb2222',
            promptVersion: 'v3.1',
            pairs: 312,
            quota: 300,
            withinQuota: false,
            sigmaLlm: 0.62,
            sigmaSource: 'measured',
            generatedAt: '2026-09-18T00:00:00.000Z',
        });
    });

    it('запись чужой формы идёт в skipped', async () => {
        const service = makeService([
            record({
                id: 'good',
                periodKey: 'aaaa',
                payload: goldenReport('v3.1'),
                createdAt: new Date('2026-09-18T00:00:00.000Z'),
            }),
            record({
                id: 'alien',
                periodKey: 'bbbb',
                payload: { что: 'угодно' },
                createdAt: new Date('2026-09-19T00:00:00.000Z'),
            }),
        ]);
        const result = await service.list(DOMAIN);
        expect(result.total).toBe(1);
        expect(result.skipped).toBe(1);
    });

    it('отчётов нет — пустой состав с подсказкой и runAvailable = false', async () => {
        const service = makeService([]);
        const result = await service.list(DOMAIN);
        expect(result.entries).toEqual([]);
        expect(result.runAvailable).toBe(false);
        expect(result.hint).toBe(GOLDEN_SET_MESSAGES.hint);
    });

    it('run: джоба не ставится, причина названа', () => {
        const service = makeService([]);
        expect(service.run(DOMAIN)).toEqual({
            domain: DOMAIN,
            dispatched: false,
            jobId: null,
            reason: GOLDEN_SET_MESSAGES.runNotWired,
        });
    });
});
