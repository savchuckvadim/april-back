import { DIGEST_RECOMMENDATION_CODE as CODE } from '../period-digest.codes';
import {
    detectDigestRecommendations,
    recommendDigest,
} from '../period-digest.recommend';
import { newDigestRecommendation } from '../period-digest.status';
import {
    digestCalls,
    digestContextOf,
    sectionAsWas,
} from './digest-context.fixture';

/** Слабы оба раздела презентации, возражения без ответа, три слабых звонка. */
const ROWS = [
    ...digestCalls('p', 'presentation', 5, () => ({
        sections: [sectionAsWas('NEEDS', 4), sectionAsWas('PRESENTATION', 4)],
    })),
    ...digestCalls('r', 'refine', 5, () => ({
        objections: [false, false, false, true].map(handled => ({
            category: 'price',
            quote: null,
            handled,
            outcome: null,
        })),
    })),
    ...digestCalls('c', 'call', 3, () => ({ score: 30 })),
];

const carriedLowScore = newDigestRecommendation({
    code: CODE.lowScoreCalls,
    text: 'Разобрать с руководителем звонки с низкой оценкой',
    source: 'template',
    anchor: { metric: 'low_score_share' },
    periodKey: '2026-09',
    baseline: { value: 0.4, n: 10 },
    target: 0.2,
    evidence: { transcriptionIds: [], quote: null },
});

const run = (patch: Partial<Parameters<typeof recommendDigest>[0]> = {}) =>
    recommendDigest({
        periodKey: '2026-10',
        readiness: 'ok',
        context: digestContextOf(ROWS),
        previous: [],
        maxActive: 3,
        ...patch,
    }).map(item => item.code);

describe('выбор рекомендаций карточки', () => {
    it('новые — по приоритету модулей, не больше трёх активных', () => {
        expect(
            detectDigestRecommendations(digestContextOf(ROWS), '2026-10').map(
                item => item.code,
            ),
        ).toEqual([
            CODE.presentationNeeds,
            CODE.presentationFit,
            CODE.followupObjections,
            CODE.lowScoreCalls,
        ]);
        expect(run()).toEqual([
            CODE.presentationNeeds,
            CODE.presentationFit,
            CODE.followupObjections,
        ]);
    });

    it('перенесённые первыми и оцениваются по новому периоду', () => {
        const result = recommendDigest({
            periodKey: '2026-10',
            readiness: 'ok',
            context: digestContextOf(ROWS),
            previous: [carriedLowScore],
            maxActive: 3,
        });

        expect(result.map(item => item.code)).toEqual([
            CODE.lowScoreCalls,
            CODE.presentationNeeds,
            CODE.presentationFit,
        ]);
        // Слабых 3 из 13 (23 %) при базе 40 %: стало лучше, цель 20 % ещё не взята.
        expect(result[0]).toMatchObject({
            evaluations: 1,
            status: 'improved',
            lifecycle: 'active',
        });
        expect(result[1]).toMatchObject({ evaluations: 0, status: 'new' });
    });

    it('«мало данных» и «нет звонков» — новых нет, перенесённые оцениваются', () => {
        expect(
            run({ readiness: 'few_data', previous: [carriedLowScore] }),
        ).toEqual([CODE.lowScoreCalls]);
        expect(run({ readiness: 'no_calls' })).toEqual([]);
    });

    it('исключённые коды и лимит недели', () => {
        expect(
            run({ excludedCodes: new Set([CODE.presentationNeeds]) }),
        ).toEqual([
            CODE.presentationFit,
            CODE.followupObjections,
            CODE.lowScoreCalls,
        ]);
        expect(run({ maxActive: 2 })).toEqual([
            CODE.presentationNeeds,
            CODE.presentationFit,
        ]);
    });

    it('худший раздел — только когда остальные модули молчат', () => {
        const priceCalls = digestCalls('x', 'call', 6, () => ({
            sections: [sectionAsWas('PRICE', 5)],
        }));
        const withBelow = (rows: typeof priceCalls) => {
            const context = digestContextOf(rows);
            return {
                ...context,
                metrics: {
                    ...context.metrics,
                    sections: context.metrics.sections.map(item => ({
                        ...item,
                        standing: {
                            position: 'below' as const,
                            scope: 'department' as const,
                            middle: 6.5,
                        },
                    })),
                },
            };
        };

        expect(
            detectDigestRecommendations(withBelow(priceCalls), '2026-10').map(
                item => item.code,
            ),
        ).toEqual([CODE.worstSection]);
        expect(
            detectDigestRecommendations(
                withBelow([...priceCalls, ...ROWS]),
                '2026-10',
            ).map(item => item.code),
        ).not.toContain(CODE.worstSection);
    });
});
