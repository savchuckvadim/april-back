import {
    datedLiteRow,
    liteSection,
} from '../../../__tests__/dated-lite-row.fixture';
import type { DatedLiteRow } from '../../dated-lite-row';
import {
    digestAnchorDirection,
    digestAnchorUnit,
    measureDigestAnchor,
} from '../period-digest.anchors';
import {
    DIGEST_ANCHOR_METRIC,
    DIGEST_DIRECTION,
    DIGEST_UNIT,
} from '../period-digest.codes';

const CONTEXT = { lowScoreCallMax: 4 };

const row = (
    id: string,
    callType: string,
    patch: Partial<DatedLiteRow> = {},
): DatedLiteRow => datedLiteRow({ transcriptionId: id, callType, ...patch });

const objection = (handled: boolean | null) => ({
    category: 'price',
    quote: null,
    handled,
    outcome: null,
});

const methodology = (patch: {
    spiralsFull?: number | null;
    checkpointsDone?: number | null;
    checkpointsTotal?: number | null;
}) => ({
    code: 'polyansky',
    checkpointsDone: null,
    checkpointsTotal: null,
    spiralsFull: null,
    spiralsMinFull: 2,
    dealProgress: null,
    capsApplied: 0,
    ...patch,
});

describe('метрики-якоря рекомендаций', () => {
    it('оценка раздела — на звонках выбранных типов, только оценённые разделы', () => {
        const rows = [
            row('p1', 'presentation', { sections: [liteSection('NEEDS', 4)] }),
            row('p2', 'presentation', { sections: [liteSection('NEEDS', 6)] }),
            row('p3', 'presentation', {
                sections: [liteSection('NEEDS', 1, 0)],
            }),
            row('c1', 'cold', { sections: [liteSection('NEEDS', 9)] }),
        ];
        const anchor = {
            metric: DIGEST_ANCHOR_METRIC.sectionMean,
            section: 'NEEDS',
            callTypes: ['presentation'],
        };

        expect(measureDigestAnchor(anchor, rows, CONTEXT)).toEqual({
            value: 5,
            n: 2,
        });
        expect(
            measureDigestAnchor(
                { metric: DIGEST_ANCHOR_METRIC.sectionMean },
                rows,
                CONTEXT,
            ),
        ).toEqual({ value: null, n: 0 });
    });

    it('средняя оценка — шкала 1–10, звонки без корзины не считаются', () => {
        const rows = [
            row('p1', 'presentation', { score: 70 }),
            row('c1', 'cold', { score: 50 }),
            row('o1', 'other', { score: 10 }),
            row('n1', 'refine', { score: null }),
        ];

        expect(
            measureDigestAnchor(
                { metric: DIGEST_ANCHOR_METRIC.scoreMean },
                rows,
                CONTEXT,
            ),
        ).toEqual({ value: 6, n: 2 });
    });

    it('доли шага: назначен и с датой; пустая дата — без даты', () => {
        const rows = [
            row('a', 'call', { nextStep: { set: true, date: '2026-11-20' } }),
            row('b', 'call', { nextStep: { set: true, date: '' } }),
            row('c', 'call', { nextStep: { set: false, date: null } }),
            row('d', 'call', { nextStep: null }),
        ];

        expect(
            measureDigestAnchor(
                { metric: DIGEST_ANCHOR_METRIC.nextStepDatedShare },
                rows,
                CONTEXT,
            ),
        ).toEqual({ value: 0.25, n: 4 });
        expect(
            measureDigestAnchor(
                { metric: DIGEST_ANCHOR_METRIC.nextStepSetShare },
                rows,
                CONTEXT,
            ),
        ).toEqual({ value: 0.5, n: 4 });
    });

    it('доработка: возражения без ответа и шаги без даты — только refine / decision', () => {
        const rows = [
            row('r1', 'refine', {
                objections: [
                    objection(false),
                    objection(true),
                    objection(null),
                ],
                nextStep: { set: true, date: null },
            }),
            row('d1', 'decision', {
                objections: [objection(false)],
                nextStep: { set: true, date: '2026-11-25' },
            }),
            row('p1', 'presentation', {
                objections: [objection(false), objection(false)],
                nextStep: { set: true, date: null },
            }),
        ];

        expect(
            measureDigestAnchor(
                { metric: DIGEST_ANCHOR_METRIC.objectionUnhandledShare },
                rows,
                CONTEXT,
            ),
        ).toEqual({ value: 2 / 3, n: 3 });
        expect(
            measureDigestAnchor(
                { metric: DIGEST_ANCHOR_METRIC.followupStepNoDateShare },
                rows,
                CONTEXT,
            ),
        ).toEqual({ value: 0.5, n: 2 });
    });

    it('доля звонков с низкой оценкой — по порогу портала включительно', () => {
        const rows = [
            row('a', 'call', { score: 30 }),
            row('b', 'call', { score: 40 }),
            row('c', 'call', { score: 45 }),
            row('d', 'call', { score: 80 }),
        ];

        expect(
            measureDigestAnchor(
                { metric: DIGEST_ANCHOR_METRIC.lowScoreShare },
                rows,
                CONTEXT,
            ),
        ).toEqual({ value: 0.5, n: 4 });
    });

    it('методика: спирали — по презентациям, чек-пункты — выполнено из применимых', () => {
        const rows = [
            row('p1', 'presentation', {
                methodology: methodology({
                    spiralsFull: 1,
                    checkpointsDone: 2,
                    checkpointsTotal: 4,
                }),
            }),
            row('p2', 'presentation', {
                methodology: methodology({
                    spiralsFull: 2,
                    checkpointsDone: 3,
                    checkpointsTotal: 4,
                }),
            }),
            row('c1', 'cold', {
                methodology: methodology({
                    spiralsFull: 9,
                    checkpointsDone: 0,
                    checkpointsTotal: 0,
                }),
            }),
        ];

        expect(
            measureDigestAnchor(
                { metric: DIGEST_ANCHOR_METRIC.spiralsFullMean },
                rows,
                CONTEXT,
            ),
        ).toEqual({ value: 1.5, n: 2 });
        expect(
            measureDigestAnchor(
                { metric: DIGEST_ANCHOR_METRIC.checkpointsShare },
                rows,
                CONTEXT,
            ),
        ).toEqual({ value: 5 / 8, n: 2 });
    });

    it('типы звонков якоря перебивают типы по умолчанию', () => {
        const rows = [
            row('r1', 'refine', { objections: [objection(false)] }),
            row('p1', 'presentation', { objections: [objection(true)] }),
        ];

        expect(
            measureDigestAnchor(
                {
                    metric: DIGEST_ANCHOR_METRIC.objectionUnhandledShare,
                    callTypes: ['presentation'],
                },
                rows,
                CONTEXT,
            ),
        ).toEqual({ value: 0, n: 1 });
    });

    it('единица и направление к лучшему', () => {
        expect(
            digestAnchorUnit({ metric: DIGEST_ANCHOR_METRIC.sectionMean }),
        ).toBe(DIGEST_UNIT.score);
        expect(
            digestAnchorUnit({ metric: DIGEST_ANCHOR_METRIC.spiralsFullMean }),
        ).toBe(DIGEST_UNIT.perCall);
        expect(
            digestAnchorDirection({
                metric: DIGEST_ANCHOR_METRIC.lowScoreShare,
            }),
        ).toBe(DIGEST_DIRECTION.down);
        expect(
            digestAnchorDirection({
                metric: DIGEST_ANCHOR_METRIC.nextStepDatedShare,
            }),
        ).toBe(DIGEST_DIRECTION.up);
    });
});
