import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { findBatchResult } from '../prepare-batch-results.util';

/**
 * `findBatchResult` — точечное чтение результата одной batch-команды из уже
 * полученного ответа. Батч режется по 50 команд, поэтому нужная команда может
 * лежать в любом чанке, а упавший чанк может прийти вообще без `result` —
 * обе ситуации закрываем тестами, чтобы чтение id не роняло отчёт.
 */
describe('findBatchResult', () => {
    const chunk = (
        result: Record<string, unknown> | undefined,
    ): IBitrixBatchResponseResult =>
        ({
            result,
            result_error: [],
            result_total: [],
            result_next: [],
        }) as never;

    it('находит результат команды в первом чанке', () => {
        const results = [
            chunk({ add_task: { task: { id: '77' } } }),
            chunk({ other_cmd: { id: 1 } }),
        ];

        expect(findBatchResult(results, 'add_task')).toEqual({
            task: { id: '77' },
        });
    });

    it('находит результат команды во втором чанке', () => {
        const results = [
            chunk({ update_deal: true }),
            chunk({ add_task: { task: { id: 42 } } }),
        ];

        expect(findBatchResult(results, 'add_task')).toEqual({
            task: { id: 42 },
        });
    });

    it('возвращает undefined, если ключа нет ни в одном чанке', () => {
        const results = [chunk({ update_deal: true }), chunk({ add_item: 1 })];

        expect(findBatchResult(results, 'add_task')).toBeUndefined();
    });

    it('не падает на упавшем чанке без поля result и идёт дальше', () => {
        const results = [
            chunk(undefined),
            chunk({ add_task: { task: { id: 5 } } }),
        ];

        expect(findBatchResult(results, 'add_task')).toEqual({
            task: { id: 5 },
        });
    });

    it('на пустом ответе возвращает undefined', () => {
        expect(findBatchResult([], 'add_task')).toBeUndefined();
    });
});
