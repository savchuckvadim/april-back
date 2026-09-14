import {
    MATRIX_DEFAULT_THRESHOLDS,
    buildManagerTypeMatrix,
    isBelowMinDuration,
    minDurationMapOf,
} from '../model/manager-type-matrix';
import { MatrixCallRow } from '../model/matrix.types';
import { liteRow, liteRows, section, shuffle } from './lite-row.fixture';

/** m1: 10 презентаций с оценками 50…95 и разделами, 3 холодных 1 сентября. */
const presentations: MatrixCallRow[] = Array.from({ length: 10 }, (_, i) =>
    liteRow({
        transcriptionId: `p${i + 1}`,
        score: 50 + 5 * i,
        nextStep:
            i < 6
                ? { set: true, date: '2026-09-15' }
                : { set: true, date: null },
        sections: [
            section('GREETING', 8, 80),
            section('NEEDS', 5, 0),
            ...(i < 8 ? [section('PRICE', 4, 50)] : []),
            ...(i < 5 ? [section('CLOSING', 6, 80)] : []),
        ],
    }),
);
const colds = liteRows('c', 3, {
    callType: 'cold',
    score: 60,
    callStartedAt: new Date('2026-09-01T10:00:00+03:00'),
});
const payments = liteRows('q', 9, {
    managerId: 'm2',
    callType: 'payment',
    score: 60,
});
const others = liteRows('o', 2, {
    managerId: 'm2',
    callType: 'other',
    score: 30,
});
const excludedRows = [
    liteRow({ transcriptionId: 'x1', analysisPresent: false, score: null }),
    liteRow({ transcriptionId: 'x2', managerId: null }),
    liteRow({ transcriptionId: 'x3', callType: null }),
    liteRow({ transcriptionId: 'x4', durationSec: 120 }),
];
const rows = [
    ...presentations,
    ...colds,
    ...payments,
    ...others,
    ...excludedRows,
];

describe('buildManagerTypeMatrix', () => {
    const matrix = buildManagerTypeMatrix(rows);
    const m1 = matrix.managers[0];
    const presentation = m1.byType.find(
        cell => cell.callType === 'presentation',
    );

    it('менеджеры по id, типы в порядке справочника, счётчики исключений', () => {
        expect(matrix.managers.map(row => row.managerId)).toEqual(['m1', 'm2']);
        expect(m1.byType.map(cell => cell.callType)).toEqual([
            'cold',
            'presentation',
        ]);
        expect(matrix.managers[1].byType.map(cell => cell.callType)).toEqual([
            'payment',
            'other',
        ]);
        expect(matrix.analyzed).toBe(24);
        expect(matrix.noBucket).toBe(2);
        expect(matrix.comparableFrom).toBeNull();
        expect(matrix.excluded).toEqual({
            noAnalysis: 1,
            noManager: 1,
            noType: 1,
            short: 1,
            beforeComparable: 0,
        });
        expect(MATRIX_DEFAULT_THRESHOLDS.shortCallSec).toBe(300);
    });

    it('оценка ячейки — среднее weightedScore/10 при n ≥ 8, иначе none', () => {
        expect(presentation?.n).toBe(10);
        expect(presentation?.score.value).toBeCloseTo(7.25, 9);
        expect(presentation?.score.confidence.level).toBe('low');
        expect(presentation?.scoreSd).toBeGreaterThan(0);
        expect(presentation?.bucket).toBe('presentation');
        const cold = m1.byType[0];
        expect(cold.n).toBe(3);
        expect(cold.score).toEqual({
            value: null,
            n: 3,
            confidence: { level: 'none', reason: 'not-enough-data' },
        });
        expect(cold.scoreSd).toBeNull();
    });

    it('разделы только с relevance > 0, собственное n, avgScore null при n < 8', () => {
        expect(presentation?.sections).toEqual([
            { section: 'CLOSING', avgScore: null, n: 5, avgRelevance: 80 },
            { section: 'GREETING', avgScore: 8, n: 10, avgRelevance: 80 },
            { section: 'PRICE', avgScore: 4, n: 8, avgRelevance: 50 },
        ]);
    });

    it('чек-листы: доля шага с датой в процентах; hvost/5K без полей — undefined', () => {
        const checklists = presentation?.checklists;
        expect(checklists?.nextStepDateRatePct.value).toBeCloseTo(60, 9);
        expect(checklists?.nextStepDateRatePct.n).toBe(10);
        expect(checklists?.nextStepDateRatePct.confidence.level).toBe('low');
        const [lower, upper] = checklists?.nextStepDateRatePct.ci90 ?? [
            NaN,
            NaN,
        ];
        expect(lower).toBeGreaterThan(0);
        expect(lower).toBeLessThan(60);
        expect(upper).toBeGreaterThan(60);
        expect(upper).toBeLessThanOrEqual(100);
        expect(checklists?.hvostDonePct).toBeUndefined();
        expect(checklists?.fiveKDonePct).toBeUndefined();
    });

    it('hvost/5K считаются только по строкам, где флаг заполнен', () => {
        const flagged = buildManagerTypeMatrix([
            ...liteRows('h', 6, { hvostDone: true, fiveKDone: null }),
            ...liteRows('g', 2, { hvostDone: false }),
            liteRow({ transcriptionId: 'h9' }),
        ]);
        const cell = flagged.managers[0].byType[0];
        expect(cell.n).toBe(9);
        expect(cell.checklists.hvostDonePct?.n).toBe(8);
        expect(cell.checklists.hvostDonePct?.value).toBeCloseTo(75, 9);
        expect(cell.checklists.hvostDonePct?.confidence.level).toBe('low');
        expect(cell.checklists.fiveKDonePct).toBeUndefined();
        // n < 8 заполненных флагов → честное none, но поле есть
        const thin = buildManagerTypeMatrix(
            liteRows('t', 3, { hvostDone: true }),
        );
        expect(thin.managers[0].byType[0].checklists.hvostDonePct).toEqual({
            value: null,
            n: 3,
            confidence: { level: 'none', reason: 'not-enough-data' },
        });
    });

    it('опорные звонки: лучший, худший и нижняя медиана по оценке; равные — по id', () => {
        expect(presentation?.evidenceCallIds).toEqual({
            best: 'p10',
            worst: 'p1',
            median: 'p5',
        });
        expect(m1.byType[0].evidenceCallIds).toEqual({
            best: 'c1',
            worst: 'c1',
            median: 'c2',
        });
    });

    it('строка менеджера: n, оценка по звонкам с корзиной, корзины', () => {
        expect(m1.n).toBe(13);
        expect(m1.nBeforeComparable).toBe(0);
        expect(m1.score.value).toBeCloseTo(905 / 130, 9);
        expect(m1.buckets.map(item => [item.bucket, item.n])).toEqual([
            ['contact', 3],
            ['presentation', 10],
            ['closing', 0],
        ]);
        expect(m1.buckets[1].score.value).toBeCloseTo(7.25, 9);
        const m2 = matrix.managers[1];
        expect(m2.n).toBe(11);
        expect(m2.score.n).toBe(9);
        expect(m2.score.value).toBeCloseTo(6, 9);
        expect(m2.byType[1].bucket).toBeNull();
    });

    it('итоги по типам и корзины отдела', () => {
        expect(
            matrix.totals.map(cell => [cell.callType, cell.n, cell.managers]),
        ).toEqual([
            ['cold', 3, 1],
            ['presentation', 10, 1],
            ['payment', 9, 1],
            ['other', 2, 1],
        ]);
        expect(matrix.totals[1].score.value).toBeCloseTo(7.25, 9);
        expect(matrix.buckets.map(item => [item.bucket, item.n])).toEqual([
            ['contact', 3],
            ['presentation', 10],
            ['closing', 9],
        ]);
    });

    it('versionsMixed: разные сигнатуры versions или отсутствие versions у части строк', () => {
        expect(presentation?.versionsMixed).toBe(false);
        const mixed = buildManagerTypeMatrix([
            ...liteRows('v', 8),
            liteRow({
                transcriptionId: 'v9',
                versions: { prompt: 'focus-v3', rubric: 'sections-7-v1' },
            }),
        ]);
        expect(mixed.managers[0].byType[0].versionsMixed).toBe(true);
        const partial = buildManagerTypeMatrix([
            ...liteRows('w', 8),
            liteRow({ transcriptionId: 'w9', versions: null }),
        ]);
        expect(partial.managers[0].byType[0].versionsMixed).toBe(true);
    });

    it('comparableFrom отсекает старые строки: считаются отдельно, в оценки не входят', () => {
        const cut = buildManagerTypeMatrix(
            [...rows, liteRow({ transcriptionId: 'nd', callStartedAt: null })],
            { comparableFrom: '2026-09-05' },
        );
        expect(cut.comparableFrom).toBe('2026-09-05');
        expect(cut.excluded.beforeComparable).toBe(4);
        const cutM1 = cut.managers[0];
        // 3 холодных 1 сентября + строка nd без даты (менеджер m1 по умолчанию)
        expect(cutM1.n).toBe(10);
        expect(cutM1.nBeforeComparable).toBe(4);
        expect(cutM1.byType[0]).toEqual(
            expect.objectContaining({
                callType: 'cold',
                n: 0,
                nBeforeComparable: 3,
            }),
        );
        expect(cutM1.byType[1]).toEqual(
            expect.objectContaining({
                callType: 'presentation',
                n: 10,
                nBeforeComparable: 1,
            }),
        );
        expect(cutM1.byType[1].score.value).toBeCloseTo(7.25, 9);
        expect(cutM1.buckets[0].n).toBe(0);
        expect(cut.totals[0]).toEqual(
            expect.objectContaining({
                callType: 'cold',
                n: 0,
                nBeforeComparable: 3,
                managers: 0,
            }),
        );
        // без comparableFrom строка без даты — обычная сравнимая строка
        const open = buildManagerTypeMatrix([
            liteRow({ transcriptionId: 'nd', callStartedAt: null }),
        ]);
        expect(open.analyzed).toBe(1);
    });

    it('граница comparableFrom берётся в TZ портала', () => {
        const edge = [
            liteRow({
                transcriptionId: 'e1',
                callStartedAt: new Date('2026-09-04T22:30:00Z'),
            }),
        ];
        expect(
            buildManagerTypeMatrix(edge, { comparableFrom: '2026-09-05' })
                .analyzed,
        ).toBe(1);
        expect(
            buildManagerTypeMatrix(edge, {
                comparableFrom: '2026-09-05',
                timeZone: 'UTC',
            }).excluded.beforeComparable,
        ).toBe(1);
    });

    it('порог короткого звонка настраивается через thresholds', () => {
        const lenient = buildManagerTypeMatrix(rows, {
            thresholds: { shortCallSec: 60 },
        });
        expect(lenient.excluded.short).toBe(0);
        expect(lenient.analyzed).toBe(25);
    });

    describe('порог по типам (min_duration_sec_by_type, решение А.1)', () => {
        /** Холодный 90 с и презентация 90 с — одна длительность, разные типы. */
        const mixed = [
            liteRow({
                transcriptionId: 'k1',
                callType: 'cold',
                durationSec: 90,
            }),
            liteRow({
                transcriptionId: 'p1',
                callType: 'presentation',
                durationSec: 90,
            }),
        ];
        const byType = { cold: 60, presentation: 300 };

        it('карта: cold 60 / presentation 300 — холодный 90 с в слое, презентация — нет', () => {
            const matrix = buildManagerTypeMatrix(mixed, {
                minDurationSecByType: byType,
            });

            expect(matrix.analyzed).toBe(1);
            expect(matrix.excluded.short).toBe(1);
            expect(matrix.totals.map(cell => cell.callType)).toEqual(['cold']);
        });

        it('скаляр thresholds — запасной порог для типов вне карты', () => {
            const payment = liteRow({
                transcriptionId: 'q1',
                callType: 'payment',
                durationSec: 90,
            });

            expect(minDurationMapOf(120, byType)).toEqual({
                default: 120,
                cold: 60,
                presentation: 300,
            });
            expect(minDurationMapOf()).toEqual({ default: 300 });
            expect(minDurationMapOf(undefined, { default: 45 })).toEqual({
                default: 45,
            });
            expect(
                buildManagerTypeMatrix([...mixed, payment], {
                    thresholds: { shortCallSec: 120 },
                    minDurationSecByType: byType,
                }).excluded.short,
            ).toBe(2);
        });

        it('предикат «короче порога»: тип без ключа берёт default, null-длительность не короткая', () => {
            const map = minDurationMapOf(120, byType);

            expect(isBelowMinDuration(mixed[0], map)).toBe(false);
            expect(isBelowMinDuration(mixed[1], map)).toBe(true);
            expect(
                isBelowMinDuration({ callType: null, durationSec: 119 }, map),
            ).toBe(true);
            expect(
                isBelowMinDuration(
                    { callType: 'cold', durationSec: null },
                    map,
                ),
            ).toBe(false);
        });

        it('равномерная карта даёт то же, что скаляр (бит-в-бит Фаза 1a)', () => {
            const uniform = Object.fromEntries(
                ['cold', 'presentation', 'payment', 'other'].map(type => [
                    type,
                    300,
                ]),
            );

            expect(
                buildManagerTypeMatrix(rows, { minDurationSecByType: uniform }),
            ).toEqual(matrix);
        });
    });

    it('детерминизм: перестановка входа и повторный вызов дают тот же результат', () => {
        expect(buildManagerTypeMatrix(shuffle(rows, 11))).toEqual(matrix);
        expect(buildManagerTypeMatrix(rows)).toEqual(matrix);
    });

    it('пустой вход → пустая матрица с тремя пустыми корзинами', () => {
        const empty = buildManagerTypeMatrix([]);
        expect(empty.managers).toEqual([]);
        expect(empty.totals).toEqual([]);
        expect(empty.buckets.map(item => item.n)).toEqual([0, 0, 0]);
        expect(empty.analyzed).toBe(0);
    });
});
