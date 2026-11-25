import { CALL_BADGE_IDS, type CallBadgeId } from '@lib/sales-ai-analytics';
import {
    badgeFacets,
    callTypesLockOf,
    filterByBadges,
    isMainBadge,
    isMainPoint,
    pointFacets,
    type CallListBadgeSelection,
} from '../calls-list-badges.filter';
import type { CallListPointFilter } from '../calls-list.types';
import {
    badgeContextOf,
    pointDefOf,
    pointsOf,
    rowOf,
} from './calls-list.fixtures';

const CODES = ['cold.c', 'pres.a', 'pres.b'];

const ids = (rows: { transcriptionId: string }[]): string[] =>
    rows.map(row => row.transcriptionId);

const selectionOf = (
    badges: CallBadgeId[] = [],
    points: CallListPointFilter[] = [],
): CallListBadgeSelection => ({ badges, points });

describe('раздел «Разборы звонков»: фильтры по бейджам', () => {
    const context = badgeContextOf([], CODES);

    describe('общие бейджи', () => {
        const rows = [
            rowOf('1', { badges: ['step_missing', 'outcome_refused'] }),
            rowOf('2', {
                badges: ['step_missing', 'signal', 'outcome_advanced'],
            }),
            rowOf('3', { badges: ['signal'] }),
            rowOf('4', { badges: ['outcome_refused'] }),
            rowOf('5', { badges: [] }),
        ];

        it('ничего не выбрано — все строки', () => {
            expect(ids(filterByBadges(rows, selectionOf(), context))).toEqual([
                '1',
                '2',
                '3',
                '4',
                '5',
            ]);
        });

        it('бейджи без семейства — «и»: звонок несёт все выбранные', () => {
            expect(
                ids(
                    filterByBadges(
                        rows,
                        selectionOf(['step_missing']),
                        context,
                    ),
                ),
            ).toEqual(['1', '2']);
            expect(
                ids(
                    filterByBadges(
                        rows,
                        selectionOf(['step_missing', 'signal']),
                        context,
                    ),
                ),
            ).toEqual(['2']);
        });

        it('бейджи итога — «или» внутри семейства', () => {
            expect(
                ids(
                    filterByBadges(
                        rows,
                        selectionOf(['outcome_refused', 'outcome_advanced']),
                        context,
                    ),
                ),
            ).toEqual(['1', '2', '4']);
        });

        it('семейство и другой бейдж — «и» между ними', () => {
            expect(
                ids(
                    filterByBadges(
                        rows,
                        selectionOf([
                            'outcome_refused',
                            'outcome_advanced',
                            'step_missing',
                        ]),
                        context,
                    ),
                ),
            ).toEqual(['1', '2']);
            expect(
                ids(
                    filterByBadges(
                        rows,
                        selectionOf(['outcome_refused', 'signal']),
                        context,
                    ),
                ),
            ).toEqual([]);
        });
    });

    describe('бейджи пунктов методики', () => {
        const rows = [
            rowOf('1', {
                points: pointsOf(CODES, {
                    'pres.a': 'done',
                    'pres.b': 'missed',
                }),
            }),
            rowOf('2', {
                points: pointsOf(CODES, {
                    'pres.a': 'missed',
                    'pres.b': 'not_applicable',
                }),
            }),
            rowOf('3', {
                points: pointsOf(CODES, { 'pres.a': 'not_applicable' }),
            }),
            rowOf('4', { points: pointsOf(CODES, {}) }),
            rowOf('5', { points: '' }),
        ];
        const pointFilter = (
            code: string,
            state: CallListPointFilter['state'],
        ): CallListPointFilter => ({ code, state });

        it('исполнен — только звонки со статусом done', () => {
            const selection = selectionOf([], [pointFilter('pres.a', 'done')]);
            expect(ids(filterByBadges(rows, selection, context))).toEqual([
                '1',
            ]);
        });

        it('не исполнен — только звонки со статусом missed', () => {
            const selection = selectionOf(
                [],
                [pointFilter('pres.a', 'missed')],
            );
            expect(ids(filterByBadges(rows, selection, context))).toEqual([
                '2',
            ]);
        });

        it('«не относится» и «не проверялся» не попадают ни в одно состояние', () => {
            for (const state of ['done', 'missed'] as const) {
                const matched = ids(
                    filterByBadges(
                        rows,
                        selectionOf([], [pointFilter('pres.b', state)]),
                        context,
                    ),
                );
                // pres.b: у 1 — missed, у 2 — не относится, у 3–5 — не проверялся.
                expect(matched).toEqual(state === 'missed' ? ['1'] : []);
            }
        });

        it('несколько пунктов — «и»', () => {
            const selection = selectionOf(
                [],
                [
                    pointFilter('pres.a', 'done'),
                    pointFilter('pres.b', 'missed'),
                ],
            );
            expect(ids(filterByBadges(rows, selection, context))).toEqual([
                '1',
            ]);
            const none = selectionOf(
                [],
                [
                    pointFilter('pres.a', 'missed'),
                    pointFilter('pres.b', 'missed'),
                ],
            );
            expect(filterByBadges(rows, none, context)).toEqual([]);
        });

        it('код, которого нет в выборке, — ни одного звонка', () => {
            const selection = selectionOf([], [pointFilter('nope.x', 'done')]);
            expect(filterByBadges(rows, selection, context)).toEqual([]);
        });

        it('пункт и общий бейдж вместе — «и»', () => {
            const withBadges = [
                rowOf('1', {
                    badges: ['signal'],
                    points: pointsOf(CODES, { 'pres.a': 'missed' }),
                }),
                rowOf('2', {
                    badges: [],
                    points: pointsOf(CODES, { 'pres.a': 'missed' }),
                }),
            ];
            const selection = selectionOf(
                ['signal'],
                [pointFilter('pres.a', 'missed')],
            );
            expect(ids(filterByBadges(withBadges, selection, context))).toEqual(
                ['1'],
            );
        });
    });
});

describe('раздел «Разборы звонков»: типы звонка выбранных пунктов', () => {
    const defs = [
        pointDefOf('pres.a', { callTypes: ['presentation', 'demo'] }),
        pointDefOf('pres.b', { callTypes: ['presentation', 'cold'] }),
        pointDefOf('cold.c', { callTypes: ['cold'] }),
    ];
    const pointOf = (code: string): CallListPointFilter => ({
        code,
        state: 'missed',
    });

    it('один пункт — его типы', () => {
        expect(callTypesLockOf([pointOf('pres.a')], defs)).toEqual([
            'presentation',
            'demo',
        ]);
    });

    it('два пункта с общими типами — пересечение', () => {
        expect(
            callTypesLockOf([pointOf('pres.a'), pointOf('pres.b')], defs),
        ).toEqual(['presentation']);
    });

    it('два пункта без общих типов — пустой список', () => {
        expect(
            callTypesLockOf([pointOf('pres.a'), pointOf('cold.c')], defs),
        ).toEqual([]);
    });

    it('выбранный код без описания — null; с описанием рядом — по описанному', () => {
        expect(callTypesLockOf([pointOf('nope.x')], defs)).toBeNull();
        expect(callTypesLockOf([], defs)).toBeNull();
        expect(
            callTypesLockOf([pointOf('nope.x'), pointOf('cold.c')], defs),
        ).toEqual(['cold']);
    });

    it('исходный список типов пункта не меняется', () => {
        callTypesLockOf([pointOf('pres.a'), pointOf('pres.b')], defs);
        expect(defs[0].callTypes).toEqual(['presentation', 'demo']);
    });
});

describe('раздел «Разборы звонков»: счётчики бейджей', () => {
    const defs = [
        pointDefOf('pres.a', { main: true }),
        pointDefOf('pres.b'),
        pointDefOf('cold.c'),
    ];
    const context = badgeContextOf(defs, CODES);
    const base = [
        rowOf('A', {
            badges: ['step_missing', 'outcome_refused'],
            points: pointsOf(CODES, { 'pres.a': 'done', 'pres.b': 'missed' }),
        }),
        rowOf('B', {
            badges: ['step_missing', 'outcome_advanced'],
            points: pointsOf(CODES, { 'pres.a': 'missed' }),
        }),
        rowOf('C', {
            badges: ['signal', 'outcome_refused'],
            points: pointsOf(CODES, { 'pres.a': 'done', 'pres.b': 'done' }),
        }),
        rowOf('D', { badges: ['step_missing'] }),
    ];
    const countOf = (
        selection: CallListBadgeSelection,
        id: CallBadgeId,
    ): number | undefined =>
        badgeFacets(base, selection, context, null).find(
            facet => facet.id === id,
        )?.count;
    const pointOf = (
        selection: CallListBadgeSelection,
        code: string,
    ): { done: number; missed: number } | undefined => {
        const facet = pointFacets(base, selection, context, null).find(
            item => item.code === code,
        );
        return facet && { done: facet.done, missed: facet.missed };
    };

    it('без выбора — сколько звонков несёт каждый бейдж; все бейджи справочника по порядку', () => {
        const facets = badgeFacets(base, selectionOf(), context, null);
        expect(facets.map(facet => facet.id)).toEqual([...CALL_BADGE_IDS]);
        expect(countOf(selectionOf(), 'step_missing')).toBe(3);
        expect(countOf(selectionOf(), 'signal')).toBe(1);
        expect(countOf(selectionOf(), 'outcome_refused')).toBe(2);
        expect(countOf(selectionOf(), 'outcome_advanced')).toBe(1);
        expect(countOf(selectionOf(), 'price_named')).toBe(0);
    });

    it('поля бейджа — из справочника', () => {
        const facet = badgeFacets(base, selectionOf(), context, null).find(
            item => item.id === 'outcome_refused',
        );
        expect(facet).toMatchObject({
            title: 'Итог: отказ',
            tone: 'bad',
            family: 'outcome',
            main: true,
            since: '2026-11-06',
            count: 2,
        });
        expect(facet?.hint).toEqual(expect.any(String));
    });

    it('бейдж без семейства: проходят весь выбор и несут бейдж', () => {
        const selection = selectionOf(['step_missing']);
        // Выбор оставляет A, B, D; сигнал есть только у C — его выбор отсёк.
        expect(countOf(selection, 'step_missing')).toBe(3);
        expect(countOf(selection, 'signal')).toBe(0);
        expect(countOf(selection, 'outcome_refused')).toBe(1);
    });

    it('бейдж семейства: выбор без бейджей этого же семейства', () => {
        const selection = selectionOf(
            ['outcome_refused'],
            [{ code: 'pres.a', state: 'done' }],
        );
        // Пункт оставляет A и C. Бейдж итога заменяет выбранный итог, но не пункт.
        expect(countOf(selection, 'outcome_refused')).toBe(2);
        expect(countOf(selection, 'outcome_advanced')).toBe(0);
        // Общий бейдж — по полному выбору (итог «отказ» и пункт): A и C.
        expect(countOf(selection, 'step_missing')).toBe(1);
        expect(countOf(selection, 'signal')).toBe(1);
    });

    it('бейдж семейства при выбранном итоге: счётчик других итогов не обнуляется', () => {
        const selection = selectionOf(['outcome_refused']);
        // «Продвинулся» добавился бы по «или»: считается по звонкам без выбора итога.
        expect(countOf(selection, 'outcome_advanced')).toBe(1);
        expect(countOf(selection, 'outcome_refused')).toBe(2);
    });

    it('пункты: все описания по порядку, счётчики «исполнен» и «не исполнен»', () => {
        const facets = pointFacets(base, selectionOf(), context, null);
        expect(facets.map(facet => facet.code)).toEqual([
            'pres.a',
            'pres.b',
            'cold.c',
        ]);
        expect(pointOf(selectionOf(), 'pres.a')).toEqual({
            done: 2,
            missed: 1,
        });
        expect(pointOf(selectionOf(), 'pres.b')).toEqual({
            done: 1,
            missed: 1,
        });
        expect(pointOf(selectionOf(), 'cold.c')).toEqual({
            done: 0,
            missed: 0,
        });
        expect(facets[0]).toMatchObject({
            label: 'Пункт pres.a',
            title: 'Формулировка пункта pres.a',
            callTypes: ['presentation'],
        });
    });

    it('пункты: выбор считается без собственного фильтра пункта, но с остальными', () => {
        const selection = selectionOf(
            ['outcome_refused'],
            [{ code: 'pres.a', state: 'done' }],
        );
        // Для pres.a выбор — только «итог: отказ» (A и C); свой done не учитывается.
        expect(pointOf(selection, 'pres.a')).toEqual({ done: 2, missed: 0 });
        // Для pres.b выбор целиком — A и C: у A пункт не исполнен, у C исполнен.
        expect(pointOf(selection, 'pres.b')).toEqual({ done: 1, missed: 1 });
    });

    it('пункт описан, но в выборке периода его нет — нули', () => {
        const withUnknown = badgeContextOf(
            [...defs, pointDefOf('new.z')],
            CODES,
        );
        const facet = pointFacets(base, selectionOf(), withUnknown, null).find(
            item => item.code === 'new.z',
        );
        expect(facet).toMatchObject({ done: 0, missed: 0 });
    });

    it('счётчики считаются по переданным строкам: пустая основа — нули', () => {
        const facets = badgeFacets([], selectionOf(), context, null);
        expect(facets.every(facet => facet.count === 0)).toBe(true);
        expect(
            pointFacets([], selectionOf(), context, null).every(
                facet => facet.done === 0 && facet.missed === 0,
            ),
        ).toBe(true);
    });
});

describe('раздел «Разборы звонков»: «основные» бейджи', () => {
    const defs = [pointDefOf('pres.a', { main: true }), pointDefOf('pres.b')];
    const context = badgeContextOf(defs, CODES);

    it('набора портала нет — основные по справочнику и по методике', () => {
        expect(isMainBadge('step_missing', null)).toBe(true);
        expect(isMainBadge('price_named', null)).toBe(false);
        expect(isMainPoint(defs[0], null)).toBe(true);
        expect(isMainPoint(defs[1], null)).toBe(false);
        const badges = badgeFacets([], selectionOf(), context, null);
        expect(
            badges.filter(badge => badge.main).map(badge => badge.id),
        ).toEqual([
            'step_missing',
            'objection_unhandled',
            'signal',
            'outcome_refused',
            'progress_low',
        ]);
        const points = pointFacets([], selectionOf(), context, null);
        expect(points.map(point => point.main)).toEqual([true, false]);
    });

    it('набор портала важнее справочника и методики; пункт — с приставкой «m:»', () => {
        const override = new Set(['price_named', 'm:pres.b']);
        expect(isMainBadge('step_missing', override)).toBe(false);
        expect(isMainBadge('price_named', override)).toBe(true);
        expect(isMainPoint(defs[0], override)).toBe(false);
        expect(isMainPoint(defs[1], override)).toBe(true);
        const badges = badgeFacets([], selectionOf(), context, override);
        expect(
            badges.filter(badge => badge.main).map(badge => badge.id),
        ).toEqual(['price_named']);
        const points = pointFacets([], selectionOf(), context, override);
        expect(points.map(point => point.main)).toEqual([false, true]);
    });

    it('пустой набор портала — основных нет', () => {
        const override = new Set<string>();
        const badges = badgeFacets([], selectionOf(), context, override);
        expect(badges.some(badge => badge.main)).toBe(false);
        expect(
            pointFacets([], selectionOf(), context, override).some(
                point => point.main,
            ),
        ).toBe(false);
    });
});
