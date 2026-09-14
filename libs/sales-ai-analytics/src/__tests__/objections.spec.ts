import {
    OBJECTION_CATEGORY_UNKNOWN,
    buildObjectionsSlice,
    compareObjectionCategories,
} from '../model/objections';
import { liteRow, objection, shuffle } from './lite-row.fixture';

const rows = [
    liteRow({
        transcriptionId: 'a1',
        objections: [
            objection({ outcome: 'continued' }),
            objection({ outcome: 'converted', handled: true }),
            objection({ outcome: 'disengaged', handled: false }),
        ],
    }),
    liteRow({
        transcriptionId: 'a2',
        objections: [
            objection({ outcome: 'weird-value', handled: null }),
            objection({ outcome: null, handled: false }),
            objection({ category: 'trust', outcome: 'converted' }),
            objection({ category: null, outcome: 'continued', handled: null }),
        ],
    }),
    liteRow({
        transcriptionId: 'b1',
        managerId: 'm2',
        objections: [objection({ category: 'timing', handled: false })],
    }),
    // не участвуют: без разбора, без менеджера, короткий
    liteRow({
        transcriptionId: 'x1',
        analysisPresent: false,
        objections: [objection()],
    }),
    liteRow({
        transcriptionId: 'x2',
        managerId: null,
        objections: [objection()],
    }),
    liteRow({
        transcriptionId: 'x3',
        durationSec: 120,
        objections: [objection()],
    }),
];

describe('buildObjectionsSlice', () => {
    const slice = buildObjectionsSlice(rows);

    it('outcome читается как есть; неизвестное значение и null → other', () => {
        const m1 = slice.byManager.find(item => item.managerId === 'm1');
        const price = m1?.byCategory.find(item => item.category === 'price');
        expect(price?.n).toBe(5);
        expect(price?.calls).toBe(2);
        expect(price?.outcomes).toEqual({
            continued: 1,
            converted: 1,
            disengaged: 1,
            other: 2,
        });
    });

    it('handledRatePct — только среди возражений с известным handled; n < 8 → none', () => {
        const price = slice.byManager[0].byCategory[0];
        // price у m1: handled true, true, false, null, false → известных 4 < 8
        expect(price.handledRatePct).toEqual({
            value: null,
            n: 4,
            confidence: { level: 'none', reason: 'not-enough-data' },
        });
    });

    it('handledRatePct при n ≥ 8 — в процентах с интервалом Уилсона', () => {
        const many = buildObjectionsSlice([
            liteRow({
                transcriptionId: 'h1',
                objections: [
                    ...Array.from({ length: 7 }, () =>
                        objection({ handled: true }),
                    ),
                    ...Array.from({ length: 3 }, () =>
                        objection({ handled: false }),
                    ),
                    objection({ handled: null }),
                ],
            }),
        ]);
        const price = many.byManager[0].byCategory[0];
        expect(price.n).toBe(11);
        expect(price.handledRatePct.n).toBe(10);
        expect(price.handledRatePct.value).toBeCloseTo(70, 9);
        expect(price.handledRatePct.confidence.level).toBe('low');
        const [lower, upper] = price.handledRatePct.ci90 ?? [NaN, NaN];
        expect(lower).toBeLessThan(70);
        expect(upper).toBeGreaterThan(70);
        expect(upper).toBeLessThanOrEqual(100);
    });

    it('категория null → unknown, порядок: справочник → прочие → unknown', () => {
        const categories = slice.byManager[0].byCategory.map(
            item => item.category,
        );
        expect(categories).toEqual([
            'price',
            'trust',
            OBJECTION_CATEGORY_UNKNOWN,
        ]);
        expect(
            ['zzz', OBJECTION_CATEGORY_UNKNOWN, 'hidden', 'aaa', 'price'].sort(
                compareObjectionCategories,
            ),
        ).toEqual([
            'price',
            'hidden',
            'aaa',
            'zzz',
            OBJECTION_CATEGORY_UNKNOWN,
        ]);
    });

    it('строки без разбора, без менеджера и короткие не участвуют; итоги по всем', () => {
        expect(slice.n).toBe(8);
        expect(slice.byManager.map(item => item.managerId)).toEqual([
            'm1',
            'm2',
        ]);
        expect(slice.byManager[1].byCategory).toEqual([
            expect.objectContaining({ category: 'timing', n: 1 }),
        ]);
        const totalPrice = slice.totals.find(item => item.category === 'price');
        expect(totalPrice?.n).toBe(5);
        expect(slice.totals.map(item => item.category)).toEqual([
            'price',
            'timing',
            'trust',
            OBJECTION_CATEGORY_UNKNOWN,
        ]);
    });

    it('shortCallSec настраивается: порог 60 с возвращает короткий звонок', () => {
        expect(buildObjectionsSlice(rows, { shortCallSec: 60 }).n).toBe(9);
    });

    it('карта порогов по типам: короткий x3 (presentation, 120 с) возвращается только своим порогом', () => {
        // x3 — презентация 120 с: порог презентации 300 режет, порог 60 — нет;
        // карта с cold: 60 презентацию не задевает (её тип вне карты → default).
        expect(
            buildObjectionsSlice(rows, { minDurationSecByType: { cold: 60 } })
                .n,
        ).toBe(slice.n);
        expect(
            buildObjectionsSlice(rows, {
                minDurationSecByType: { presentation: 60 },
            }).n,
        ).toBe(9);
        expect(
            buildObjectionsSlice(rows, {
                shortCallSec: 60,
                minDurationSecByType: { presentation: 300 },
            }).n,
        ).toBe(slice.n);
    });

    it('детерминизм: перестановка входа и повторный вызов дают тот же результат', () => {
        expect(buildObjectionsSlice(shuffle(rows, 7))).toEqual(slice);
        expect(buildObjectionsSlice(rows)).toEqual(slice);
    });

    it('пустой вход → пустой срез', () => {
        expect(buildObjectionsSlice([])).toEqual({
            byManager: [],
            totals: [],
            n: 0,
        });
    });
});
