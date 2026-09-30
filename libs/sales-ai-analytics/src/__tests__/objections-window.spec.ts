import { buildManagerTypeMatrix } from '../model/manager-type-matrix';
import type { MatrixCallRow } from '../model/matrix.types';
import { buildObjectionsSlice } from '../model/objections';
import { liteRow, objection } from './lite-row.fixture';

/**
 * Срез возражений считается по тем же звонкам, что объём и оценки
 * периода (досье, 30.09.2026): звонок без типа и звонок до границы
 * сравнимости в него не попадают, а доля отработанных несёт свои
 * счётчики, чтобы её можно было пересчитать по окну из нескольких недель.
 */
const TZ = 'Europe/Moscow';

/** Звонок с одним возражением «цена»: одно возражение — один звонок. */
const priced = (id: string, patch: Partial<MatrixCallRow> = {}) =>
    liteRow({
        transcriptionId: id,
        objections: [objection({ handled: true })],
        ...patch,
    });

const rows = [
    priced('in-1'),
    priced('in-2', { callStartedAt: new Date('2026-09-10T12:00:00+03:00') }),
    // Тип не определён: матрица его не считает (noType) — срез тоже.
    priced('no-type', { callType: null }),
    // Звонок до разрыва ряда настройками (по дню звонка).
    priced('before', { callStartedAt: new Date('2026-09-01T12:00:00+03:00') }),
    // Без даты при заданной границе — «до границы».
    priced('no-date', { callStartedAt: null }),
];

describe('buildObjectionsSlice: те же звонки, что у матрицы периода', () => {
    it('звонок без типа не попадает в срез даже без границы сравнимости', () => {
        const slice = buildObjectionsSlice([
            priced('typed'),
            priced('untyped', { callType: '' }),
            priced('null-type', { callType: null }),
        ]);

        expect(slice.n).toBe(1);
        expect(slice.totals).toEqual([
            expect.objectContaining({ category: 'price', n: 1, calls: 1 }),
        ]);
    });

    it('разрыв ряда настройками: звонки раньше дня и без даты отсекаются, как в матрице', () => {
        const options = { seriesBreakFrom: '2026-09-05', timeZone: TZ };
        const slice = buildObjectionsSlice(rows, options);
        const matrix = buildManagerTypeMatrix(rows, options);

        expect(slice.n).toBe(2);
        expect(slice.totals[0].calls).toBe(2);
        // Ровно те звонки, что вошли в n матрицы.
        expect(matrix.analyzed).toBe(slice.totals[0].calls);
        expect(matrix.excluded.beforeComparable).toBe(2);
        expect(matrix.excluded.noType).toBe(1);
    });

    it('граница по версии разбора: срез режет строки той же функцией, что матрица', () => {
        // У строк фикстуры набор versions датирован 2026-09-05.
        const options = { comparableVersionFrom: '2026-09-06', timeZone: TZ };
        const slice = buildObjectionsSlice(rows, options);
        const matrix = buildManagerTypeMatrix(rows, options);

        expect(slice.n).toBe(0);
        expect(matrix.analyzed).toBe(0);
    });

    it('границ нет — дата звонка не участвует (прежнее поведение)', () => {
        const slice = buildObjectionsSlice(rows);

        expect(slice.n).toBe(4);
        expect(slice.totals[0].calls).toBe(4);
    });
});

describe('buildObjectionsSlice: счётчики доли отработанных', () => {
    it('handled и handledKnown лежат рядом с долей, неизвестный handled не считается', () => {
        const slice = buildObjectionsSlice([
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
        const price = slice.totals[0];

        expect(price).toMatchObject({ n: 11, handled: 7, handledKnown: 10 });
        expect(price.handledRatePct.n).toBe(price.handledKnown);
        expect(price.handledRatePct.value).toBeCloseTo(70, 9);
        expect(slice.byManager[0].byCategory[0]).toEqual(price);
    });

    it('категория без известного handled — нулевые счётчики и пустая доля', () => {
        const slice = buildObjectionsSlice([
            liteRow({
                transcriptionId: 'u1',
                objections: [objection({ handled: null })],
            }),
        ]);

        expect(slice.totals[0]).toMatchObject({
            handled: 0,
            handledKnown: 0,
            handledRatePct: { value: null, n: 0 },
        });
    });
});
