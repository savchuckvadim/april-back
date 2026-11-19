import {
    callListFacets,
    filterCallRows,
    pageOfRows,
    sortCallRows,
    summarizeCallReviews,
    visibleCallRows,
} from '../calls-list.filter';
import { indexOf, queryOf, reviewOf, rowOf } from './calls-list.fixtures';

const ids = (rows: { transcriptionId: string }[]): string[] =>
    rows.map(row => row.transcriptionId);

describe('раздел «Разборы звонков»: фильтры', () => {
    const rows = [
        rowOf('1', { managerId: '447', callType: 'cold', aiScore: 2 }),
        rowOf('2', { managerId: '512', callType: 'presentation', aiScore: 8 }),
        rowOf('3', { managerId: '447', callType: null, aiScore: null }),
        rowOf('4', { managerId: null, callType: 'cold', aiScore: 6 }),
    ];
    const reviews = {
        '1': [reviewOf('10', { agree: false })],
        '2': [reviewOf('10'), reviewOf('11')],
    };

    it('без фильтров — все строки', () => {
        expect(ids(filterCallRows(rows, reviews, queryOf()))).toEqual([
            '1',
            '2',
            '3',
            '4',
        ]);
    });

    it('менеджеры и типы звонка', () => {
        expect(
            ids(
                filterCallRows(rows, reviews, queryOf({ managerIds: ['447'] })),
            ),
        ).toEqual(['1', '3']);
        expect(
            ids(
                filterCallRows(rows, reviews, queryOf({ callTypes: ['cold'] })),
            ),
        ).toEqual(['1', '4']);
    });

    it('оценка от–до: границы включительно, без оценки — мимо', () => {
        expect(
            ids(
                filterCallRows(
                    rows,
                    reviews,
                    queryOf({ scoreMin: 2, scoreMax: 6 }),
                ),
            ),
        ).toEqual(['1', '4']);
        expect(
            ids(filterCallRows(rows, reviews, queryOf({ scoreMin: 7 }))),
        ).toEqual(['2']);
    });

    it('отзывы: с отзывом, без отзыва, есть несогласие', () => {
        const by = (review: 'reviewed' | 'not_reviewed' | 'disagreed') =>
            ids(filterCallRows(rows, reviews, queryOf({ review })));
        expect(by('reviewed')).toEqual(['1', '2']);
        expect(by('not_reviewed')).toEqual(['3', '4']);
        expect(by('disagreed')).toEqual(['1']);
    });

    it('периметр: невидимый менеджер и звонок без менеджера скрыты', () => {
        const index = indexOf(rows);
        expect(
            ids(
                visibleCallRows(index, {
                    role: 'op',
                    visibleManagerIds: ['447'],
                }),
            ),
        ).toEqual(['1', '3']);
        expect(
            ids(
                visibleCallRows(index, {
                    role: 'cup',
                    visibleManagerIds: null,
                    isSuperUser: true,
                }),
            ),
        ).toEqual(['1', '2', '3', '4']);
    });
});

describe('раздел «Разборы звонков»: порядок и страницы', () => {
    const rows = [
        rowOf('1', { startedAt: '2026-11-10T08:00:00.000Z', aiScore: 4 }),
        rowOf('2', { startedAt: '2026-11-12T08:00:00.000Z', aiScore: null }),
        rowOf('3', { startedAt: '2026-11-11T08:00:00.000Z', aiScore: 9 }),
        rowOf('4', { startedAt: '2026-11-11T08:00:00.000Z', aiScore: 4 }),
    ];

    it('по дате: новые сверху; равное время — по номеру', () => {
        expect(ids(sortCallRows(rows, 'date_desc'))).toEqual([
            '2',
            '4',
            '3',
            '1',
        ]);
        expect(ids(sortCallRows(rows, 'date_asc'))).toEqual([
            '1',
            '3',
            '4',
            '2',
        ]);
    });

    it('по оценке: без оценки в конце, при равной оценке — новые сверху', () => {
        expect(ids(sortCallRows(rows, 'score_asc'))).toEqual([
            '4',
            '1',
            '3',
            '2',
        ]);
        expect(ids(sortCallRows(rows, 'score_desc'))).toEqual([
            '3',
            '4',
            '1',
            '2',
        ]);
    });

    it('сортировка не портит исходный массив', () => {
        const before = ids(rows);
        sortCallRows(rows, 'score_desc');
        expect(ids(rows)).toEqual(before);
    });

    it('страницы с 1; за последней — пусто', () => {
        const many = Array.from({ length: 7 }, (_, i) => rowOf(String(i + 1)));
        expect(ids(pageOfRows(many, 1, 3))).toEqual(['1', '2', '3']);
        expect(ids(pageOfRows(many, 3, 3))).toEqual(['7']);
        expect(pageOfRows(many, 4, 3)).toEqual([]);
    });
});

describe('раздел «Разборы звонков»: сводка отзывов и фасеты', () => {
    it('сводка: число, несогласия, средняя, мой, последний', () => {
        const summary = summarizeCallReviews(
            [
                reviewOf('10', {
                    agree: false,
                    leaderScore: 4,
                    createdAt: '2026-11-12T10:00:00.000Z',
                }),
                reviewOf('11', {
                    leaderScore: 7,
                    createdAt: '2026-11-13T10:00:00.000Z',
                }),
                reviewOf('12', { leaderScore: null }),
            ],
            '10',
        );
        expect(summary).toEqual({
            count: 3,
            disagreeCount: 1,
            avgLeaderScore: 5.5,
            mine: { leaderScore: 4, agree: false },
            lastAt: '2026-11-13T10:00:00.000Z',
        });
    });

    it('без отзывов — пустая сводка, без моего', () => {
        expect(summarizeCallReviews([], '10')).toEqual({
            count: 0,
            disagreeCount: 0,
            avgLeaderScore: null,
            mine: null,
            lastAt: null,
        });
    });

    it('фасеты: менеджеры по имени (без имени — в конце), типы по числу', () => {
        const facets = callListFacets(
            [
                rowOf('1', { managerId: '512', callType: 'cold' }),
                rowOf('2', { managerId: '447', callType: 'cold' }),
                rowOf('3', { managerId: '900', callType: 'unknown_code' }),
                rowOf('4', { managerId: '447', callType: null }),
            ],
            { '447': 'Яковлева Анна', '512': 'Андреев Пётр' },
        );
        expect(facets.managers).toEqual([
            { id: '512', name: 'Андреев Пётр', count: 1 },
            { id: '447', name: 'Яковлева Анна', count: 2 },
            { id: '900', name: null, count: 1 },
        ]);
        expect(facets.callTypes.map(type => [type.code, type.count])).toEqual([
            ['cold', 2],
            ['unknown_code', 1],
        ]);
        expect(facets.callTypes[1].title).toBeNull();
    });
});
