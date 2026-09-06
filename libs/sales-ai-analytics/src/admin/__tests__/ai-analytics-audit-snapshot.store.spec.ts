import {
    AI_ANALYTICS_AUDIT_APP,
    AI_ANALYTICS_AUDIT_PROVIDER,
    AI_ANALYTICS_AUDIT_TYPE,
    AiAnalyticsAuditSnapshotPayload,
    parseAuditSnapshotPayload,
} from '../../contracts/audit-snapshot.types';
import { AiAnalyticsAuditSnapshotStore } from '../ai-analytics-audit-snapshot.store';
import { auditReportFixture } from './audit-report.fixture';

const NOW = new Date('2026-09-06T04:10:00Z');

function payload(
    generatedAt: string,
    source: AiAnalyticsAuditSnapshotPayload['source'] = 'cron',
): AiAnalyticsAuditSnapshotPayload {
    return {
        report: auditReportFixture('d', generatedAt.slice(0, 10)),
        months: 6,
        timeZone: 'Europe/Moscow',
        generatedAt,
        source,
    };
}

function aisRecord(
    id: string,
    createdAt: string,
    userResult: unknown,
    result = `# отчёт ${id}`,
) {
    return {
        id,
        createdAt: new Date(createdAt),
        user_result: userResult,
        result,
    };
}

function makeStore(records: object[] = []) {
    const aiService = {
        create: jest.fn((input: Record<string, unknown>) =>
            Promise.resolve({ id: '9001', ...input }),
        ),
        findByDomainTypesInPeriod: jest.fn().mockResolvedValue(records),
    };
    return {
        store: new AiAnalyticsAuditSnapshotStore(aiService as never),
        aiService,
    };
}

describe('AiAnalyticsAuditSnapshotStore (ais, снапшоты аудита)', () => {
    it('save пишет запись с фиксированными type/app/provider, markdown в result и payload в user_result', async () => {
        const { store, aiService } = makeStore();
        const snapshot = payload('2026-09-06T04:10:00.000Z', 'admin');
        const id = await store.save({
            domain: 'd',
            markdown: '# отчёт',
            payload: snapshot,
        });
        expect(id).toBe('9001');
        expect(aiService.create).toHaveBeenCalledWith({
            provider: AI_ANALYTICS_AUDIT_PROVIDER,
            app: AI_ANALYTICS_AUDIT_APP,
            type: AI_ANALYTICS_AUDIT_TYPE,
            status: 'done',
            result: '# отчёт',
            user_result: JSON.parse(JSON.stringify(snapshot)) as unknown,
            domain: 'd',
        });
    });

    it('latest берёт самую свежую по created_at запись распознаваемой формы', async () => {
        const { store, aiService } = makeStore([
            aisRecord(
                '1',
                '2026-07-01T01:10:00Z',
                payload('2026-07-01T01:10:00.000Z'),
            ),
            aisRecord(
                '3',
                '2026-09-01T01:10:00Z',
                payload('2026-09-01T01:10:00.000Z'),
            ),
            // Чужая форма user_result (например, feedback) — пропускается.
            aisRecord('4', '2026-09-05T01:10:00Z', {
                kind: 'view',
                object: 'pulse',
            }),
            aisRecord(
                '2',
                '2026-08-01T01:10:00Z',
                payload('2026-08-01T01:10:00.000Z', 'admin'),
            ),
        ]);
        const latest = await store.latest('d', NOW);
        expect(latest).toMatchObject({
            id: '3',
            markdown: '# отчёт 3',
            generatedAt: '2026-09-01T01:10:00.000Z',
            source: 'cron',
            months: 6,
        });
        expect(latest?.report.meta.domain).toBe('d');

        // Окно поиска: 400 дней назад … сутки вперёд, только тип аудита.
        expect(aiService.findByDomainTypesInPeriod).toHaveBeenCalledWith(
            'd',
            [AI_ANALYTICS_AUDIT_TYPE],
            new Date(NOW.getTime() - 400 * 24 * 60 * 60 * 1000),
            new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
        );
    });

    it('latest → null, если записей нет или все чужой формы', async () => {
        expect(await makeStore().store.latest('d', NOW)).toBeNull();
        const { store } = makeStore([
            aisRecord('4', '2026-09-05T01:10:00Z', { kind: 'view' }),
            aisRecord('5', '2026-09-05T01:10:00Z', null),
        ]);
        expect(await store.latest('d', NOW)).toBeNull();
    });
});

describe('parseAuditSnapshotPayload', () => {
    it('принимает полный payload и отклоняет неполный/чужой', () => {
        const full = payload('2026-09-01T01:10:00.000Z');
        expect(
            parseAuditSnapshotPayload(JSON.parse(JSON.stringify(full))),
        ).toEqual(full);
        expect(
            parseAuditSnapshotPayload({ ...full, source: 'manual' }),
        ).toBeNull();
        expect(parseAuditSnapshotPayload({ ...full, months: '6' })).toBeNull();
        expect(
            parseAuditSnapshotPayload({ ...full, report: { meta: {} } }),
        ).toBeNull();
        expect(parseAuditSnapshotPayload('строка')).toBeNull();
        expect(parseAuditSnapshotPayload(null)).toBeNull();
    });
});
