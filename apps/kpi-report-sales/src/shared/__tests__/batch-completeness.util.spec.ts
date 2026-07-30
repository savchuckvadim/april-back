import {
    assertBatchComplete,
    IncompleteBatchError,
    mergeBatchResults,
} from '../lib/batch-completeness.util';
import type { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';

const chunk = (
    totals: Record<string, number>,
    errors: Record<string, unknown> = {},
): IBitrixBatchResponseResult =>
    ({
        result: Object.fromEntries(Object.keys(totals).map(k => [k, []])),
        result_total: totals,
        result_error: errors,
        result_next: [],
    }) as unknown as IBitrixBatchResponseResult;

describe('mergeBatchResults', () => {
    it('сливает result/result_total/result_error по всем чанкам', () => {
        const merged = mergeBatchResults([
            chunk({ a: 1, b: 2 }),
            chunk({ c: 3 }, { d: { error: 'QUERY_LIMIT_EXCEEDED' } }),
        ]);

        expect(Object.keys(merged.result).sort()).toEqual(['a', 'b', 'c']);
        expect(merged.totals).toEqual({ a: 1, b: 2, c: 3 });
        expect(merged.errors).toEqual({ d: { error: 'QUERY_LIMIT_EXCEEDED' } });
    });

    it('пустой массив чанков → пустые словари', () => {
        expect(mergeBatchResults([])).toEqual({
            result: {},
            totals: {},
            errors: {},
        });
    });
});

describe('assertBatchComplete', () => {
    it('полный набор ключей → не бросает', () => {
        const merged = mergeBatchResults([chunk({ a: 1, b: 0 })]);
        expect(() =>
            assertBatchComplete(merged, ['a', 'b'], 'тест'),
        ).not.toThrow();
    });

    it('пропавший ключ → IncompleteBatchError с перечнем и контекстом', () => {
        const merged = mergeBatchResults([chunk({ a: 1 })]);
        expect(() =>
            assertBatchComplete(merged, ['a', 'b'], 'статистика звонков'),
        ).toThrow(IncompleteBatchError);
        expect(() =>
            assertBatchComplete(merged, ['a', 'b'], 'статистика звонков'),
        ).toThrow(/1 из 2.*статистика звонков.*b/);
    });

    it('детали result_error по пропавшему ключу попадают в сообщение', () => {
        const merged = mergeBatchResults([
            chunk({ a: 1 }, { b: { error: 'QUERY_LIMIT_EXCEEDED' } }),
        ]);
        expect(() => assertBatchComplete(merged, ['a', 'b'], 'тест')).toThrow(
            /QUERY_LIMIT_EXCEEDED/,
        );
    });
});
