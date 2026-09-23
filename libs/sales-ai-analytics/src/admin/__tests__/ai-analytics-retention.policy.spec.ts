import {
    AI_ANALYTICS_RETENTION_KEEP_VERSIONS,
    planRetention,
    RETENTION_REASONS,
    RetentionCandidate,
} from '../ai-analytics-retention.policy';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    AiAnalyticsSnapshotType,
} from '../../contracts/snapshot-kinds.const';
import {
    snapshotRetentionDays,
    snapshotRetentionRecords,
} from '../../contracts/snapshot-descriptors.const';

const NOW = new Date('2026-09-22T00:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

/** Дата «N дней назад» от NOW — ожидания считаются формулой, не константой. */
const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * DAY_MS);

function candidate(
    partial: Partial<RetentionCandidate> & {
        id: string;
        type: AiAnalyticsSnapshotType;
    },
): RetentionCandidate {
    return {
        periodKey: '2026-09',
        managerId: null,
        status: 'superseded',
        createdAt: daysAgo(1),
        ...partial,
    };
}

describe('planRetention', () => {
    it('бессрочные типы не трогает вовсе (forever)', () => {
        const forever = [
            AI_ANALYTICS_SNAPSHOT_TYPE.goldenReport,
            AI_ANALYTICS_SNAPSHOT_TYPE.settingsAudit,
            AI_ANALYTICS_SNAPSHOT_TYPE.ropMark,
            AI_ANALYTICS_SNAPSHOT_TYPE.feedback,
        ];
        const records = forever.flatMap((type, typeIndex) =>
            [0, 1, 2, 3, 4].map(index =>
                candidate({
                    id: `${typeIndex}-${index}`,
                    type,
                    periodKey: `2020-0${index + 1}`,
                    createdAt: daysAgo(3650),
                }),
            ),
        );
        const plan = planRetention(records, { now: NOW });
        expect(plan.total).toBe(0);
        expect(plan.scanned).toBe(records.length);
        for (const entry of plan.byType) {
            expect(entry.unit).toBe('forever');
            expect(entry.victims).toBe(0);
        }
    });

    it('ретенция по дням: удаляет только записи старше срока дескриптора', () => {
        const type = AI_ANALYTICS_SNAPSHOT_TYPE.etlRun;
        const days = snapshotRetentionDays(type);
        expect(days).not.toBeNull();
        const limit = days as number;
        // По одной записи на день: свежие в пределах срока, старые — за ним.
        const records = [
            candidate({
                id: 'fresh',
                type,
                periodKey: 'p-fresh',
                createdAt: daysAgo(limit - 1),
            }),
            candidate({
                id: 'edge',
                type,
                periodKey: 'p-edge',
                createdAt: daysAgo(limit),
            }),
            candidate({
                id: 'old',
                type,
                periodKey: 'p-old',
                createdAt: daysAgo(limit + 1),
            }),
            candidate({
                id: 'ancient',
                type,
                periodKey: 'p-ancient',
                createdAt: daysAgo(limit * 2),
            }),
        ];
        const plan = planRetention(records, { now: NOW });
        expect(plan.victims.map(victim => victim.id).sort()).toEqual([
            'ancient',
            'old',
        ]);
        expect(
            plan.victims.every(
                victim => victim.reason === RETENTION_REASONS.expiredDays,
            ),
        ).toBe(true);
    });

    it('живой ключ отдаёт только версии сверх последних 2 (решение B10)', () => {
        const type = AI_ANALYTICS_SNAPSHOT_TYPE.etlRun;
        const limit = snapshotRetentionDays(type) as number;
        // Четыре версии ОДНОГО ключа; ключ живой — самая свежая версия
        // моложе срока хранения, значит ключ целиком не просрочен.
        const records = [0, 1, 2, 3].map(index =>
            candidate({
                id: `v${index}`,
                type,
                periodKey: '2026-09-01',
                createdAt: daysAgo(limit - 10 + index),
            }),
        );
        const plan = planRetention(records, { now: NOW });
        // v0 и v1 — самые свежие версии ключа, их удерживаем.
        expect(plan.victims.map(victim => victim.id).sort()).toEqual([
            'v2',
            'v3',
        ]);
        expect(
            plan.victims.every(
                victim => victim.reason === RETENTION_REASONS.oldVersion,
            ),
        ).toBe(true);
        expect(AI_ANALYTICS_RETENTION_KEEP_VERSIONS).toBe(2);
    });

    it('полностью просроченный ключ уходит целиком, включая актуальную запись', () => {
        const type = AI_ANALYTICS_SNAPSHOT_TYPE.etlRun;
        const limit = snapshotRetentionDays(type) as number;
        const records = [0, 1, 2].map(index =>
            candidate({
                id: `v${index}`,
                type,
                periodKey: '2020-01-01',
                status: index === 0 ? 'done' : 'superseded',
                createdAt: daysAgo(limit + 1 + index),
            }),
        );
        const plan = planRetention(records, { now: NOW });
        expect(plan.victims.map(victim => victim.id).sort()).toEqual([
            'v0',
            'v1',
            'v2',
        ]);
        expect(
            plan.victims.every(
                victim => victim.reason === RETENTION_REASONS.expiredDays,
            ),
        ).toBe(true);
    });

    it('у живого ключа актуальную запись (status = done) не удаляет', () => {
        const type = AI_ANALYTICS_SNAPSHOT_TYPE.forecast;
        const limit = snapshotRetentionDays(type) as number;
        // Ключ живой: самая свежая версия моложе срока хранения.
        const records = [
            candidate({
                id: 'current',
                type,
                periodKey: '2026-09-20',
                status: 'done',
                createdAt: daysAgo(1),
            }),
            candidate({
                id: 'old-1',
                type,
                periodKey: '2026-09-20',
                createdAt: daysAgo(2),
            }),
            candidate({
                id: 'old-2',
                type,
                periodKey: '2026-09-20',
                createdAt: daysAgo(limit - 1),
            }),
        ];
        const plan = planRetention(records, { now: NOW });
        expect(plan.victims.map(victim => victim.id)).toEqual(['old-2']);
        expect(plan.victims[0].reason).toBe(RETENTION_REASONS.oldVersion);
    });

    it('ретенция по числу записей: на менеджера остаётся N свежих периодов', () => {
        const type = AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth;
        const keep = snapshotRetentionRecords(type) as number;
        expect(keep).toBeGreaterThan(0);
        // keep + 3 месяца одного менеджера, по одной актуальной записи.
        const months = keep + 3;
        const records = Array.from({ length: months }, (unused, index) =>
            candidate({
                id: `m${index}`,
                type,
                managerId: '154',
                status: 'done',
                periodKey: `k${String(index).padStart(3, '0')}`,
                createdAt: daysAgo(index),
            }),
        );
        const plan = planRetention(records, { now: NOW });
        expect(plan.total).toBe(months - keep);
        expect(
            plan.victims.every(
                victim => victim.reason === RETENTION_REASONS.overCount,
            ),
        ).toBe(true);
        // Удаляются самые старые периоды, свежие keep остаются.
        expect(plan.victims.map(victim => victim.id).sort()).toEqual(
            Array.from(
                { length: months - keep },
                (unused, index) => `m${keep + index}`,
            ).sort(),
        );
    });

    it('разные менеджеры считаются независимо (зерно manager-month)', () => {
        const type = AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth;
        const keep = snapshotRetentionRecords(type) as number;
        const build = (managerId: string): RetentionCandidate[] =>
            Array.from({ length: keep + 1 }, (unused, index) =>
                candidate({
                    id: `${managerId}-${index}`,
                    type,
                    managerId,
                    periodKey: `k${String(index).padStart(3, '0')}`,
                    createdAt: daysAgo(index),
                }),
            );
        const plan = planRetention([...build('1'), ...build('2')], {
            now: NOW,
        });
        // По одному лишнему периоду у каждого менеджера.
        expect(plan.total).toBe(2);
        expect(plan.victims.map(victim => victim.managerId).sort()).toEqual([
            '1',
            '2',
        ]);
    });

    it('сводка byType повторяет дескрипторы и суммы совпадают с victims', () => {
        const records = [
            candidate({
                id: 'a',
                type: AI_ANALYTICS_SNAPSHOT_TYPE.etlRun,
                periodKey: 'a',
                createdAt: daysAgo(5000),
            }),
            candidate({
                id: 'b',
                type: AI_ANALYTICS_SNAPSHOT_TYPE.brief,
                periodKey: 'b',
                createdAt: daysAgo(5000),
            }),
            candidate({
                id: 'c',
                type: AI_ANALYTICS_SNAPSHOT_TYPE.feedback,
                periodKey: 'c',
                createdAt: daysAgo(5000),
            }),
        ];
        const plan = planRetention(records, { now: NOW });
        expect(plan.scanned).toBe(3);
        expect(plan.byType).toHaveLength(3);
        const etl = plan.byType.find(
            entry => entry.type === AI_ANALYTICS_SNAPSHOT_TYPE.etlRun,
        );
        expect(etl).toMatchObject({
            unit: 'days',
            value: snapshotRetentionDays(AI_ANALYTICS_SNAPSHOT_TYPE.etlRun),
            scanned: 1,
        });
        const sumVictims = plan.byType.reduce(
            (total, entry) => total + entry.victims,
            0,
        );
        expect(sumVictims).toBe(plan.total);
        expect(plan.total).toBe(plan.victims.length);
    });

    it('пустой вход — пустой план', () => {
        const plan = planRetention([], { now: NOW });
        expect(plan).toEqual({
            victims: [],
            byType: [],
            scanned: 0,
            total: 0,
        });
    });
});
