import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { hasBatchRef, resolveBatchRefs } from '../resolve-batch-refs.util';

const chunk = (result: Record<string, unknown>) =>
    ({ result, result_error: [] }) as unknown as IBitrixBatchResponseResult;

describe('hasBatchRef', () => {
    it('видит ссылку в середине и в конце строки', () => {
        expect(hasBatchRef('410377_$result[set_base_deal]_done')).toBe(true);
        expect(hasBatchRef('D_$result[set_pres_deal]')).toBe(true);
        expect(hasBatchRef('410377_278763_done')).toBe(false);
    });
});

/*
 * gsirk 10.11.2026: код уникальной записи KPI с `$result[...]` в середине
 * Битрикс обрезал до `410377_278763` — вторая волна подставляет id сама.
 */
describe('resolveBatchRefs — id из ответа уже выполненной пачки', () => {
    const results = [
        chunk({ set_base_deal: 278763 }),
        chunk({ add_task: { task: { id: '900' } } }),
    ];

    it('подставляет id в середину кода — хвост кода цел', () => {
        expect(
            resolveBatchRefs('410377_$result[set_base_deal]_done', results),
        ).toBe('410377_278763_done');
    });

    it('обходит вложенные объекты и массивы, путь [task][id] тоже', () => {
        const payload = {
            dedup: { key: '410377_$result[set_base_deal]_plan' },
            values: {
                crm: { n0: 'CO_410377', n1: 'D_$result[set_base_deal]' },
                links: ['T_$result[add_task][task][id]'],
                count: 2,
                empty: null,
            },
        };

        expect(resolveBatchRefs(payload, results)).toEqual({
            dedup: { key: '410377_278763_plan' },
            values: {
                crm: { n0: 'CO_410377', n1: 'D_278763' },
                links: ['T_900'],
                count: 2,
                empty: null,
            },
        });
    });

    it('команды нет в ответе (упала) — null: такое значение писать нельзя', () => {
        expect(
            resolveBatchRefs('410377_$result[set_base_deal]_done', [chunk({})]),
        ).toBeNull();
    });

    it('без ссылок — значение как есть', () => {
        expect(resolveBatchRefs({ a: 'x', b: [1] }, results)).toEqual({
            a: 'x',
            b: [1],
        });
    });
});
