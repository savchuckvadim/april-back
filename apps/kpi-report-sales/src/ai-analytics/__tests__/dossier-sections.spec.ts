import { DEFAULT_WORK_CALENDAR } from '@lib/sales-ai-analytics';
import { AI_DOSSIER_REASONS } from '../constants/ai-dossier.const';
import {
    dossierPlanFact,
    dossierTrends,
    dossierYoy,
    windowAnalyzed,
} from '../domain/assembler/dossier-sections';
import type { DossierSnapshotView } from '../domain/assembler/dossier.reader';
import type { DossierPlanFactSource } from '../domain/loaders/dossier-neighbours.loader';

/**
 * Разделы досье, собираемые презентерами соседних ручек (Фаза 3): блок
 * либо причина пустого раздела — «нет снапшота», «нет истории», «данных
 * мало», «источник упал».
 */
const MANAGER = '512';
const NOW = new Date('2026-09-22T06:15:00.000Z');

const view = (
    id: string,
    periodKey: string,
    payload: unknown,
): DossierSnapshotView => ({
    id,
    periodKey,
    managerId: MANAGER,
    generatedAt: '2026-09-21T00:00:00.000Z',
    payload,
});

const monthPayload = (n: number, departmentId: number | null = null) => ({
    n,
    byType: [
        {
            callType: 'presentation',
            n,
            score: { value: 7.2, n, confidence: { level: 'ok' } },
        },
    ],
    finance: { salesSum: 0, salesCount: 0, averageCheck: null },
    passport: { departmentId },
});

const trendsPayload = (confidence = 'ok') => ({
    weekKey: '2026-W38',
    calls: 214,
    confidence,
    metrics: [{ metric: 'quality', points: 21 }],
    signals: [],
});

const planFactSource = (
    overrides: Partial<DossierPlanFactSource> = {},
): DossierPlanFactSource => ({
    monthKey: '2026-09',
    plan: null,
    calendar: DEFAULT_WORK_CALENDAR,
    timeZone: 'Europe/Moscow',
    dailyPlanEnabled: true,
    ...overrides,
});

describe('windowAnalyzed — разборов за окно', () => {
    it('сумма n месяцев; чужая форма — 0', () => {
        expect(
            windowAnalyzed([
                view('a', '2026-08', { n: 12 }),
                view('b', '2026-09', { n: 30 }),
                view('c', '2026-07', 'мусор'),
            ]),
        ).toBe(42);
        expect(windowAnalyzed([])).toBe(0);
    });
});

describe('dossierTrends', () => {
    it('снапшота нет — no-snapshots', () => {
        expect(dossierTrends(null, 40)).toEqual({
            block: null,
            missing: AI_DOSSIER_REASONS.noSnapshots,
        });
    });

    it('снапшот есть, разборов мало — блока нет, причина too-few-data', () => {
        const outcome = dossierTrends(
            view('t', '2026-W38', trendsPayload()),
            3,
        );

        expect(outcome.block).toBeNull();
        expect(outcome.missing).toBe(AI_DOSSIER_REASONS.tooFewData);
    });

    it('снапшот и объём на месте — блок тем же презентером, что у обзора', () => {
        const outcome = dossierTrends(
            view('t', '2026-W38', trendsPayload()),
            40,
        );

        expect(outcome.block).toEqual({
            weekKey: '2026-W38',
            calls: 214,
            weeks: 21,
            confidence: 'ok',
            signals: [],
            goodhart: null,
        });
    });
});

describe('dossierYoy', () => {
    it('месяца год назад нет — no-history', () => {
        expect(
            dossierYoy(
                view('m', '2026-09', monthPayload(40)),
                null,
                '2026-09',
                null,
            ),
        ).toEqual({ block: null, missing: AI_DOSSIER_REASONS.noHistory });
    });

    it('оба месяца ниже порога — блока нет, причина too-few-data', () => {
        const outcome = dossierYoy(
            view('m', '2026-09', monthPayload(2)),
            view('b', '2025-09', monthPayload(3)),
            '2026-09',
            null,
        );

        expect(outcome.block).toBeNull();
        expect(outcome.missing).toBe(AI_DOSSIER_REASONS.tooFewData);
    });

    it('смена отдела между периодами читается из паспортов месяцев (В9)', () => {
        const outcome = dossierYoy(
            view('m', '2026-09', monthPayload(40, 171)),
            view('b', '2025-09', monthPayload(30, 91)),
            '2026-09',
            null,
        );

        expect(outcome.block).toMatchObject({
            periodKey: '2026-09',
            basePeriodKey: '2025-09',
            comparable: false,
        });
        expect(outcome.block?.reasons).toContain('department-changed');
    });

    it('текущего месяца нет — пара всё равно показывается с числами базы', () => {
        const outcome = dossierYoy(
            null,
            view('b', '2025-09', monthPayload(30)),
            '2026-09',
            null,
        );

        expect(outcome.block?.metrics.length).toBeGreaterThan(0);
    });
});

describe('dossierPlanFact', () => {
    it('настроек нет — section-failed', () => {
        expect(dossierPlanFact(null, null, MANAGER, NOW)).toEqual({
            block: null,
            missing: AI_DOSSIER_REASONS.sectionFailed,
        });
    });

    it('без снимка целей и месяца — блок есть, причины внутри него', () => {
        const outcome = dossierPlanFact(planFactSource(), null, MANAGER, NOW);

        expect(outcome.block?.period).toMatchObject({
            monthKey: '2026-09',
            today: '2026-09-22',
            closed: false,
        });
        expect(outcome.block?.rows).toEqual([
            expect.objectContaining({ managerId: MANAGER }),
        ]);
        expect(outcome.block?.reasons).toEqual(
            expect.arrayContaining(['plan-snapshot-missing']),
        );
    });

    it('закрытый месяц окна помечается closed', () => {
        const outcome = dossierPlanFact(
            planFactSource({ monthKey: '2026-08' }),
            view('m', '2026-08', monthPayload(40)),
            MANAGER,
            NOW,
        );

        expect(outcome.block?.period.closed).toBe(true);
    });
});
