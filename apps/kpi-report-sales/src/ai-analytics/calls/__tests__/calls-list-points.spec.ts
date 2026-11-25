import type { AnalyticsLitePoint } from '@lib/call-lib/call-report-analytics/types/analytics-lite.types';
import type { CheckpointStatus } from '@lib/call-lib/call-report/methodology/methodology.types';
import {
    collectPointCodes,
    encodePoints,
    pointIndexMap,
    pointStatusAt,
} from '../calls-list-points.util';

const pointOf = (
    code: string,
    status: CheckpointStatus,
): AnalyticsLitePoint => ({ code, status });

const rowOf = (points?: AnalyticsLitePoint[]) => ({
    methodology: points
        ? {
              code: 'polyansky',
              checkpointsDone: null,
              checkpointsTotal: null,
              spiralsFull: null,
              spiralsMinFull: null,
              dealProgress: null,
              capsApplied: 0,
              points,
          }
        : undefined,
});

describe('статусы пунктов методики: запись по кодам выборки', () => {
    describe('collectPointCodes', () => {
        it('коды всех звонков — без повторов и по алфавиту', () => {
            const codes = collectPointCodes([
                rowOf([pointOf('pres.b', 'done'), pointOf('cold.a', 'missed')]),
                rowOf([
                    pointOf('pres.b', 'missed'),
                    pointOf('close.z', 'done'),
                ]),
            ]);
            expect(codes).toEqual(['close.z', 'cold.a', 'pres.b']);
        });

        it('звонки без методики и без пунктов кодов не дают', () => {
            expect(collectPointCodes([])).toEqual([]);
            expect(collectPointCodes([rowOf(), rowOf([])])).toEqual([]);
        });
    });

    describe('encodePoints и pointStatusAt', () => {
        const codes = ['a.one', 'b.two', 'c.three', 'd.four'];

        it('символ на код: исполнено, не исполнено, не относится, не проверялся', () => {
            const encoded = encodePoints(
                [
                    pointOf('a.one', 'done'),
                    pointOf('b.two', 'missed'),
                    pointOf('c.three', 'not_applicable'),
                ],
                codes,
            );
            expect(encoded).toBe('dmn-');
        });

        it('запись читается обратно: статус по позиции кода', () => {
            const encoded = encodePoints(
                [
                    pointOf('d.four', 'missed'),
                    pointOf('a.one', 'done'),
                    pointOf('c.three', 'not_applicable'),
                ],
                codes,
            );
            const index = pointIndexMap(codes);
            const statusOf = (code: string) =>
                pointStatusAt(encoded, index.get(code) ?? -1);
            expect(statusOf('a.one')).toBe('done');
            expect(statusOf('b.two')).toBeNull();
            expect(statusOf('c.three')).toBe('not_applicable');
            expect(statusOf('d.four')).toBe('missed');
        });

        it('пункт у звонка не проверялся — «-» и null', () => {
            const encoded = encodePoints([pointOf('a.one', 'done')], codes);
            expect(encoded).toBe('d---');
            expect(pointStatusAt(encoded, 2)).toBeNull();
        });

        it('пунктов нет или методики нет — «-» на каждый код', () => {
            expect(encodePoints(undefined, codes)).toBe('----');
            expect(encodePoints([], codes)).toBe('----');
        });

        it('кодов в выборке нет — пустая запись', () => {
            expect(encodePoints([pointOf('a.one', 'done')], [])).toBe('');
        });

        it('позиция вне записи, дробная или отрицательная — null', () => {
            expect(pointStatusAt('dm', 2)).toBeNull();
            expect(pointStatusAt('dm', -1)).toBeNull();
            expect(pointStatusAt('dm', 0.5)).toBeNull();
            expect(pointStatusAt('', 0)).toBeNull();
        });

        it('чужой символ в записи — null, а не ошибка', () => {
            expect(pointStatusAt('x', 0)).toBeNull();
        });
    });

    describe('pointIndexMap', () => {
        it('код — позиция в списке', () => {
            const map = pointIndexMap(['a', 'b', 'c']);
            expect(map.get('a')).toBe(0);
            expect(map.get('c')).toBe(2);
            expect(map.get('z')).toBeUndefined();
            expect(pointIndexMap([]).size).toBe(0);
        });
    });
});
