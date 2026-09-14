import {
    ALL_TYPES_KEY,
    analysisCells,
    analyzedShareInCellsWithMinN,
    AuditCallRow,
    collapseCellsByManagerMonth,
    durationStats,
    durationStatsByMonth,
    fieldPresence,
    managerCoverageByMonth,
    noiseShareByMonth,
    pct,
    pivotCellsByMonth,
    quantile,
    UNKNOWN_KEY,
    versionsByMonth,
} from '../audit/ai-analytics-audit.calc';

const row = (overrides: Partial<AuditCallRow> = {}): AuditCallRow => ({
    transcriptionId: '1',
    managerId: '7',
    month: '2026-08',
    durationSec: 600,
    callType: 'cold',
    analysisPresent: true,
    versionKey: null,
    fields: null,
    ...overrides,
});

describe('ai-analytics-audit.calc', () => {
    describe('quantile', () => {
        it('пустой ряд даёт null', () => {
            expect(quantile([], 0.5)).toBeNull();
        });

        it('один элемент — любой квантиль равен ему', () => {
            expect(quantile([5], 0.1)).toBe(5);
            expect(quantile([5], 0.9)).toBe(5);
        });

        it('интерполирует линейно (R type 7) и не сортирует исходный массив', () => {
            const values = [4, 1, 3, 2];
            expect(quantile(values, 0.5)).toBe(2.5);
            expect(quantile(values, 0.1)).toBe(1.3);
            expect(quantile(values, 0.9)).toBe(3.7);
            expect(values).toEqual([4, 1, 3, 2]);
        });
    });

    describe('pct', () => {
        it('округляет до одного знака и даёт null при нулевом знаменателе', () => {
            expect(pct(1, 3)).toBe(33.3);
            expect(pct(2, 2)).toBe(100);
            expect(pct(0, 0)).toBeNull();
        });
    });

    describe('managerCoverageByMonth', () => {
        it('группирует по месяцам по возрастанию и считает долю с менеджером', () => {
            const result = managerCoverageByMonth([
                row({
                    month: '2026-08',
                    managerId: null,
                    analysisPresent: false,
                }),
                row({ month: '2026-08', managerId: '7' }),
                row({ month: '2026-07', managerId: '9' }),
                row({ month: '2026-07', managerId: null }),
                row({
                    month: '2026-07',
                    managerId: null,
                    analysisPresent: false,
                }),
            ]);
            expect(result).toEqual([
                {
                    month: '2026-07',
                    total: 3,
                    withManager: 1,
                    withManagerPct: 33.3,
                    analyzed: 2,
                    analyzedWithManager: 1,
                },
                {
                    month: '2026-08',
                    total: 2,
                    withManager: 1,
                    withManagerPct: 50,
                    analyzed: 1,
                    analyzedWithManager: 1,
                },
            ]);
        });

        it('пустой вход даёт пустой список', () => {
            expect(managerCoverageByMonth([])).toEqual([]);
        });
    });

    describe('analysisCells', () => {
        it('считает только разобранные звонки, подставляет unknown и сортирует', () => {
            const cells = analysisCells([
                row({ month: '2026-08', managerId: '7', callType: 'cold' }),
                row({ month: '2026-08', managerId: '7', callType: 'cold' }),
                row({ month: '2026-08', managerId: null, callType: null }),
                row({ month: '2026-07', managerId: '9', callType: 'call' }),
                row({
                    month: '2026-08',
                    managerId: '7',
                    analysisPresent: false,
                }),
            ]);
            expect(cells).toEqual([
                { month: '2026-07', managerId: '9', callType: 'call', n: 1 },
                { month: '2026-08', managerId: '7', callType: 'cold', n: 2 },
                {
                    month: '2026-08',
                    managerId: UNKNOWN_KEY,
                    callType: UNKNOWN_KEY,
                    n: 1,
                },
            ]);
        });
    });

    describe('collapseCellsByManagerMonth', () => {
        it('суммирует типы внутри менеджера и месяца', () => {
            const collapsed = collapseCellsByManagerMonth([
                { month: '2026-08', managerId: '7', callType: 'cold', n: 3 },
                { month: '2026-08', managerId: '7', callType: 'call', n: 5 },
                { month: '2026-08', managerId: '9', callType: 'cold', n: 1 },
            ]);
            expect(collapsed).toEqual([
                {
                    month: '2026-08',
                    managerId: '7',
                    callType: ALL_TYPES_KEY,
                    n: 8,
                },
                {
                    month: '2026-08',
                    managerId: '9',
                    callType: ALL_TYPES_KEY,
                    n: 1,
                },
            ]);
        });
    });

    describe('analyzedShareInCellsWithMinN', () => {
        it('доля разборов в ячейках с n ≥ minN', () => {
            const share = analyzedShareInCellsWithMinN(
                [
                    {
                        month: '2026-08',
                        managerId: '7',
                        callType: 'cold',
                        n: 8,
                    },
                    {
                        month: '2026-08',
                        managerId: '9',
                        callType: 'cold',
                        n: 2,
                    },
                ],
                8,
            );
            expect(share).toBe(80);
        });

        it('без ячеек даёт null', () => {
            expect(analyzedShareInCellsWithMinN([], 8)).toBeNull();
        });
    });

    describe('pivotCellsByMonth', () => {
        it('строит сводную по месяцу: канонический порядок типов, unknown в конце', () => {
            const pivots = pivotCellsByMonth(
                [
                    {
                        month: '2026-08',
                        managerId: '7',
                        callType: 'presentation',
                        n: 2,
                    },
                    {
                        month: '2026-08',
                        managerId: '7',
                        callType: 'cold',
                        n: 8,
                    },
                    {
                        month: '2026-08',
                        managerId: '9',
                        callType: UNKNOWN_KEY,
                        n: 1,
                    },
                    {
                        month: '2026-08',
                        managerId: '9',
                        callType: 'zzz_custom',
                        n: 1,
                    },
                ],
                8,
            );
            expect(pivots).toHaveLength(1);
            expect(pivots[0].typeOrder).toEqual([
                'cold',
                'presentation',
                'zzz_custom',
                UNKNOWN_KEY,
            ]);
            expect(pivots[0].managers).toEqual([
                {
                    managerId: '7',
                    byType: { presentation: 2, cold: 8 },
                    total: 10,
                },
                {
                    managerId: '9',
                    byType: { [UNKNOWN_KEY]: 1, zzz_custom: 1 },
                    total: 2,
                },
            ]);
            expect(pivots[0].inCellsWithMinNPct).toBe(66.7);
        });

        it('месяцы идут по возрастанию', () => {
            const pivots = pivotCellsByMonth(
                [
                    {
                        month: '2026-09',
                        managerId: '7',
                        callType: 'cold',
                        n: 1,
                    },
                    {
                        month: '2026-07',
                        managerId: '7',
                        callType: 'cold',
                        n: 1,
                    },
                ],
                8,
            );
            expect(pivots.map(pivot => pivot.month)).toEqual([
                '2026-07',
                '2026-09',
            ]);
        });
    });

    describe('noiseShareByMonth', () => {
        it('считает other/irrelevant от звонков с известным типом', () => {
            const result = noiseShareByMonth([
                row({ callType: 'other' }),
                row({ callType: 'irrelevant' }),
                row({ callType: 'cold' }),
                row({ callType: 'cold' }),
                row({ callType: null }),
            ]);
            expect(result).toEqual([
                {
                    month: '2026-08',
                    total: 5,
                    typed: 4,
                    byType: {
                        other: { n: 1, pct: 25 },
                        irrelevant: { n: 1, pct: 25 },
                    },
                },
            ]);
        });
    });

    describe('durationStats', () => {
        it('квантили, пропуски и доля коротких', () => {
            const stats = durationStats(
                [
                    row({ durationSec: 100 }),
                    row({ durationSec: 200 }),
                    row({ durationSec: 400 }),
                    row({ durationSec: 800 }),
                    row({ durationSec: null }),
                ],
                300,
            );
            expect(stats).toEqual({
                n: 4,
                missing: 1,
                p10: 130,
                p50: 300,
                p90: 680,
                shortCount: 2,
                shortPct: 50,
            });
        });

        // Порог приходит из правил аудита, а правила — из настроек портала
        // (min_duration_sec_by_type, решение владельца А.1): смена порога
        // обязана двигать долю коротких, иначе аудит описывает не ту выборку.
        it('порог из rules меняет долю коротких на тех же звонках', () => {
            const rows = [
                row({ durationSec: 100 }),
                row({ durationSec: 200 }),
                row({ durationSec: 400 }),
                row({ durationSec: 800 }),
            ];

            // 2 из 4 короче 300 с; 1 из 4 короче 120 с; короче 60 с — ни одного.
            expect(durationStats(rows, 300)).toMatchObject({
                shortCount: 2,
                shortPct: 50,
            });
            expect(durationStats(rows, 120)).toMatchObject({
                shortCount: 1,
                shortPct: 25,
            });
            expect(durationStats(rows, 60)).toMatchObject({
                shortCount: 0,
                shortPct: 0,
            });
        });

        it('без длительностей — null-квантили и null-доля', () => {
            expect(durationStats([row({ durationSec: null })], 300)).toEqual({
                n: 0,
                missing: 1,
                p10: null,
                p50: null,
                p90: null,
                shortCount: 0,
                shortPct: null,
            });
        });

        it('по месяцам считает каждый месяц отдельно', () => {
            const result = durationStatsByMonth(
                [
                    row({ month: '2026-07', durationSec: 100 }),
                    row({ month: '2026-08', durationSec: 900 }),
                ],
                300,
            );
            expect(result.map(item => [item.month, item.shortPct])).toEqual([
                ['2026-07', 100],
                ['2026-08', 0],
            ]);
        });
    });

    describe('versionsByMonth', () => {
        it('считает только разборы, версию без ключа помечает unknown', () => {
            const result = versionsByMonth([
                row({ versionKey: 'prompt=v2' }),
                row({ versionKey: 'prompt=v2' }),
                row({ versionKey: null }),
                row({ versionKey: 'prompt=v1', analysisPresent: false }),
                row({ month: '2026-07', versionKey: 'prompt=v1' }),
            ]);
            expect(result).toEqual([
                { month: '2026-07', versionKey: 'prompt=v1', n: 1 },
                { month: '2026-08', versionKey: 'prompt=v2', n: 2 },
                { month: '2026-08', versionKey: UNKNOWN_KEY, n: 1 },
            ]);
        });
    });

    describe('fieldPresence', () => {
        it('суммирует счётчики полей и считает доли', () => {
            const result = fieldPresence([
                row({
                    fields: {
                        nextStepSet: true,
                        nextStepDate: true,
                        sectionsTotal: 7,
                        sectionsWithAlternatives: 7,
                        objectionsTotal: 2,
                        objectionsWithQuote: 1,
                    },
                }),
                row({
                    fields: {
                        nextStepSet: true,
                        nextStepDate: false,
                        sectionsTotal: 7,
                        sectionsWithAlternatives: 0,
                        objectionsTotal: 0,
                        objectionsWithQuote: 0,
                    },
                }),
                row({ fields: null }),
            ]);
            expect(result).toEqual({
                analyzed: 2,
                nextStep: {
                    set: 2,
                    withDate: 1,
                    withDatePctOfAnalyzed: 50,
                    withDatePctOfSet: 50,
                },
                sections: {
                    callsWithAny: 1,
                    callsWithAnyPct: 50,
                    total: 14,
                    withAlternatives: 7,
                    withAlternativesPct: 50,
                },
                objections: {
                    callsWithObjections: 1,
                    total: 2,
                    withQuote: 1,
                    withQuotePct: 50,
                },
            });
        });

        it('без разборов все доли null', () => {
            const result = fieldPresence([row({ fields: null })]);
            expect(result.analyzed).toBe(0);
            expect(result.nextStep.withDatePctOfAnalyzed).toBeNull();
            expect(result.sections.withAlternativesPct).toBeNull();
            expect(result.objections.withQuotePct).toBeNull();
        });
    });
});
