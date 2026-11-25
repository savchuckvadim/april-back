import { countFacets, type FacetSpec } from '../facet-count';
import { matchesGroups, type ConditionGroup } from '../condition-groups';
import { pageOf } from '../page-of';

interface Row {
    id: number;
    tag: string;
    score: number | null;
}

const ROWS: Row[] = [
    { id: 1, tag: 'a', score: 10 },
    { id: 2, tag: 'b', score: 20 },
    { id: 3, tag: 'a', score: null },
    { id: 4, tag: 'c', score: 40 },
];

describe('pageOf', () => {
    const numbers = [1, 2, 3, 4, 5, 6, 7];

    it('первая страница — первые pageSize строк', () => {
        expect(pageOf(numbers, 1, 3)).toEqual([1, 2, 3]);
    });

    it('последняя неполная страница — хвост списка', () => {
        expect(pageOf(numbers, 3, 3)).toEqual([7]);
    });

    it('страница за пределами списка — пустой массив', () => {
        expect(pageOf(numbers, 4, 3)).toEqual([]);
        expect(pageOf([], 1, 3)).toEqual([]);
    });

    it('номер страницы меньше 1 — пустой массив, а не срез из середины', () => {
        expect(pageOf(numbers, 0, 3)).toEqual([]);
        expect(pageOf(numbers, -1, 3)).toEqual([]);
    });

    it('размер страницы меньше 1 — пустой массив', () => {
        expect(pageOf(numbers, 1, 0)).toEqual([]);
        expect(pageOf(numbers, 2, -3)).toEqual([]);
    });
});

describe('countFacets', () => {
    const facets: FacetSpec<Row>[] = [
        { id: 'tagA', test: row => row.tag === 'a' },
        { id: 'scored', test: row => row.score !== null },
        { id: 'none', test: () => false },
    ];

    it('считает строки, проходящие каждый признак', () => {
        expect(countFacets(ROWS, facets)).toEqual({
            tagA: 2,
            scored: 3,
            none: 0,
        });
    });

    it('признак, которому не соответствует ни одна строка, получает 0', () => {
        expect(countFacets(ROWS, [facets[2]])).toEqual({ none: 0 });
    });

    it('пустой список строк — 0 по всем признакам', () => {
        expect(countFacets([], facets)).toEqual({
            tagA: 0,
            scored: 0,
            none: 0,
        });
    });

    it('без признаков — пустой объект', () => {
        expect(countFacets(ROWS, [])).toEqual({});
    });
});

describe('matchesGroups', () => {
    const isA = (row: Row): boolean => row.tag === 'a';
    const isB = (row: Row): boolean => row.tag === 'b';
    const hasScore = (row: Row): boolean => row.score !== null;
    const bigScore = (row: Row): boolean => (row.score ?? 0) >= 20;
    const row = (tag: string, score: number | null): Row => ({
        id: 0,
        tag,
        score,
    });

    it('режим all — проходит, только если выполнены все условия группы', () => {
        const group: ConditionGroup<Row> = {
            mode: 'all',
            tests: [hasScore, bigScore],
        };
        expect(matchesGroups(row('a', 20), [group])).toBe(true);
        expect(matchesGroups(row('a', 10), [group])).toBe(false);
        expect(matchesGroups(row('a', null), [group])).toBe(false);
    });

    it('режим any — проходит, если выполнено хотя бы одно условие', () => {
        const group: ConditionGroup<Row> = {
            mode: 'any',
            tests: [isA, isB],
        };
        expect(matchesGroups(row('a', null), [group])).toBe(true);
        expect(matchesGroups(row('b', null), [group])).toBe(true);
        expect(matchesGroups(row('c', null), [group])).toBe(false);
    });

    it('несколько групп объединяются через И', () => {
        const groups: ConditionGroup<Row>[] = [
            { mode: 'any', tests: [isA, isB] },
            { mode: 'all', tests: [hasScore] },
        ];
        expect(matchesGroups(row('a', 10), groups)).toBe(true);
        expect(matchesGroups(row('a', null), groups)).toBe(false);
        expect(matchesGroups(row('c', 10), groups)).toBe(false);
    });

    it('пустая группа пропускает строку в любом режиме', () => {
        expect(
            matchesGroups(row('c', null), [{ mode: 'all', tests: [] }]),
        ).toBe(true);
        expect(
            matchesGroups(row('c', null), [{ mode: 'any', tests: [] }]),
        ).toBe(true);
    });

    it('без групп строка проходит', () => {
        expect(matchesGroups(row('c', null), [])).toBe(true);
    });
});
