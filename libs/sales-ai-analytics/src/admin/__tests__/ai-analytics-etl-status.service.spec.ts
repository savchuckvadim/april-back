import { AiEntityDto } from '@lib/call-lib';
import { AI_ANALYTICS_SNAPSHOT_TYPE } from '../../contracts/snapshot-kinds.const';
import { AiAnalyticsAdminSnapshotStore } from '../ai-analytics-admin-snapshot.store';
import { AiAnalyticsEtlStatusService } from '../services/ai-analytics-etl-status.service';

const NOW = new Date('2026-09-22T06:00:00.000Z');
const DOMAIN = 'april.bitrix24.ru';

/** Запись ais журнала прогона в том виде, в каком её отдаёт AiEntityDto. */
function etlRecord(overrides: {
    id: string;
    day: string;
    rhythm?: string;
    status?: string;
    steps?: unknown[];
    warnings?: string[];
    metrics?: Record<string, number>;
    inputsDrift?: boolean;
    createdAt: Date;
}): AiEntityDto {
    const payload = {
        day: overrides.day,
        rhythm: overrides.rhythm ?? 'nightly',
        status: overrides.status ?? 'ok',
        steps: overrides.steps ?? [],
        durationMs: 51230,
        rowsLoaded: 100,
        bitrixCalls: 7,
        inputsDrift: overrides.inputsDrift ?? false,
        warnings: overrides.warnings ?? [],
        metrics: overrides.metrics ?? { ai_analytics_job_duration: 51.23 },
    };
    return {
        id: overrides.id,
        type: AI_ANALYTICS_SNAPSHOT_TYPE.etlRun,
        domain: DOMAIN,
        activity_id: overrides.day,
        model: 'p2.4',
        status: 'done',
        tokens_count: 0,
        price: 0,
        createdAt: overrides.createdAt,
        user_result: {
            managerId: null,
            paramsVersion: 'r7-3f2a',
            inputsHash: 'hash-1',
            generatedAt: `${overrides.day}T00:47:12.000Z`,
            payload,
        },
    } as unknown as AiEntityDto;
}

function makeService(records: AiEntityDto[]) {
    const aiService = {
        findByDomainTypesInPeriod: jest.fn().mockResolvedValue(records),
    };
    const store = new AiAnalyticsAdminSnapshotStore(aiService as never);
    return {
        service: new AiAnalyticsEtlStatusService(store),
        aiService,
    };
}

describe('AiAnalyticsEtlStatusService', () => {
    it('читает журналы окна нужного типа и отдаёт их свежими первыми', async () => {
        const { service, aiService } = makeService([
            etlRecord({
                id: 'old',
                day: '2026-09-19',
                createdAt: new Date('2026-09-19T01:00:00.000Z'),
            }),
            etlRecord({
                id: 'fresh',
                day: '2026-09-21',
                createdAt: new Date('2026-09-21T01:00:00.000Z'),
            }),
        ]);
        const result = await service.status(DOMAIN, 7, NOW);
        expect(result.runs.map(run => run.id)).toEqual(['fresh', 'old']);
        expect(result.domain).toBe(DOMAIN);
        expect(result.days).toBe(7);
        expect(result.checkedAt).toBe(NOW.toISOString());

        const [domain, types, from, to] = aiService.findByDomainTypesInPeriod
            .mock.calls[0] as [string, string[], Date, Date];
        expect(domain).toBe(DOMAIN);
        expect(types).toEqual([AI_ANALYTICS_SNAPSHOT_TYPE.etlRun]);
        // Окно ровно 7 суток назад от NOW и сутки вперёд.
        const day = 24 * 60 * 60 * 1000;
        expect(from.getTime()).toBe(NOW.getTime() - 7 * day);
        expect(to.getTime()).toBe(NOW.getTime() + day);
    });

    it('раскладывает шаги: skipped и failed попадают в отдельные списки', async () => {
        const { service } = makeService([
            etlRecord({
                id: 'run',
                day: '2026-09-21',
                status: 'partial',
                createdAt: new Date('2026-09-21T01:00:00.000Z'),
                steps: [
                    {
                        step: 'calls',
                        status: 'ok',
                        durationMs: 120,
                        rowsLoaded: 80,
                        bitrixCalls: 3,
                        written: 4,
                        reason: null,
                        error: null,
                    },
                    {
                        step: 'stage-history',
                        status: 'skipped',
                        durationMs: 5,
                        rowsLoaded: 0,
                        bitrixCalls: 0,
                        written: 0,
                        reason: 'stage-history-too-short',
                        error: null,
                    },
                    {
                        step: 'finance',
                        status: 'failed',
                        durationMs: 12,
                        rowsLoaded: 0,
                        bitrixCalls: 1,
                        written: 0,
                        reason: 'boom',
                        error: 'boom',
                    },
                ],
                warnings: ['санити: у 2 менеджеров нет рабочих дней'],
            }),
        ]);
        const result = await service.status(DOMAIN, 7, NOW);
        const run = result.runs[0];
        expect(run.steps).toHaveLength(3);
        expect(run.skipped).toEqual(['stage-history']);
        expect(run.failed).toEqual(['finance']);
        expect(run.steps[1].reason).toBe('stage-history-too-short');
        expect(run.warnings).toEqual([
            'санити: у 2 менеджеров нет рабочих дней',
        ]);
        expect(run.metrics).toEqual({ ai_analytics_job_duration: 51.23 });
    });

    it('сводка окна: считает исходы, суммы и дрейф формулой по прогонам', async () => {
        const days = ['2026-09-21', '2026-09-20', '2026-09-19'];
        const statuses = ['ok', 'partial', 'failed'];
        const { service } = makeService(
            days.map((day, index) =>
                etlRecord({
                    id: `r${index}`,
                    day,
                    status: statuses[index],
                    inputsDrift: index === 1,
                    createdAt: new Date(`${day}T01:00:00.000Z`),
                }),
            ),
        );
        const result = await service.status(DOMAIN, 7, NOW);
        expect(result.summary).toEqual({
            runs: 3,
            ok: 1,
            partial: 1,
            failed: 1,
            // Каждая фикстура несёт rowsLoaded 100 и bitrixCalls 7.
            rowsLoaded: 3 * 100,
            bitrixCalls: 3 * 7,
            drifted: 1,
        });
    });

    it('запись чужой формы (не конверт) пропускается, ручка не падает', async () => {
        const alien = {
            id: 'alien',
            type: AI_ANALYTICS_SNAPSHOT_TYPE.etlRun,
            domain: DOMAIN,
            activity_id: '2026-09-21',
            model: '',
            status: 'done',
            tokens_count: 0,
            price: 0,
            createdAt: new Date('2026-09-21T02:00:00.000Z'),
            user_result: { что: 'угодно' },
        } as unknown as AiEntityDto;
        const { service } = makeService([
            alien,
            etlRecord({
                id: 'good',
                day: '2026-09-21',
                createdAt: new Date('2026-09-21T01:00:00.000Z'),
            }),
        ]);
        const result = await service.status(DOMAIN, 7, NOW);
        expect(result.runs.map(run => run.id)).toEqual(['good']);
        expect(result.summary.runs).toBe(1);
    });

    it('прогонов нет — пустой ответ с нулевой сводкой', async () => {
        const { service } = makeService([]);
        const result = await service.status(DOMAIN, 30, NOW);
        expect(result.runs).toEqual([]);
        expect(result.summary).toEqual({
            runs: 0,
            ok: 0,
            partial: 0,
            failed: 0,
            rowsLoaded: 0,
            bitrixCalls: 0,
            drifted: 0,
        });
    });
});
