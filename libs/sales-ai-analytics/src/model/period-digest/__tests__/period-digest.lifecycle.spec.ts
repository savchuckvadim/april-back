import {
    DIGEST_LIFECYCLE,
    DIGEST_RECOMMENDATION_CODE,
    DIGEST_STATUS,
} from '../period-digest.codes';
import {
    carryDigestRecommendations,
    evaluateDigestRecommendation,
    mergeDigestRecommendations,
} from '../period-digest.status';
import {
    MONTH_OPTIONS as OPTIONS,
    NEEDS_ANCHOR,
    evaluateMonths as evaluate,
    issueRecommendation as issue,
} from './digest-recommendation.fixture';

describe('жизненный цикл рекомендации', () => {
    it('выдача: статус «новая», оценок нет, в работе', () => {
        expect(issue()).toMatchObject({
            baseline: { periodKey: '2026-10', value: 4, n: 6 },
            history: [
                {
                    periodKey: '2026-10',
                    value: 4,
                    n: 6,
                    status: DIGEST_STATUS.new,
                    achieved: false,
                },
            ],
            status: DIGEST_STATUS.new,
            evaluations: 0,
            lifecycle: DIGEST_LIFECYCLE.active,
            hold: false,
        });
    });

    it('цель достигнута две оценки подряд — «закрепить»', () => {
        const first = evaluate(issue(), [5.2]);
        expect(first).toMatchObject({
            status: DIGEST_STATUS.improved,
            evaluations: 1,
            lifecycle: DIGEST_LIFECYCLE.active,
        });

        const second = evaluate(issue(), [5.2, 5.1]);
        expect(second).toMatchObject({
            status: DIGEST_STATUS.same,
            evaluations: 2,
            lifecycle: DIGEST_LIFECYCLE.fixed,
            hold: false,
        });
        expect(second.history.map(point => point.achieved)).toEqual([
            false,
            true,
            true,
        ]);
    });

    it('выдача не считается оценкой: цель с выдачи и первая оценка — ещё в работе', () => {
        const atTop = issue({ baseline: 10, target: 10 });
        expect(atTop.history[0].achieved).toBe(true);

        expect(evaluate(atTop, [10]).lifecycle).toBe(DIGEST_LIFECYCLE.active);
    });

    it('цель достигнута только на третьей оценке — «закрепить», «держать»', () => {
        expect(evaluate(issue(), [4.2, 4.6, 5])).toMatchObject({
            evaluations: 3,
            lifecycle: DIGEST_LIFECYCLE.fixed,
            hold: true,
        });
        // Достигнута на первой и третьей, но не подряд — тоже «держать».
        expect(evaluate(issue(), [5, 4.4, 5])).toMatchObject({
            lifecycle: DIGEST_LIFECYCLE.fixed,
            hold: true,
        });
    });

    it('три оценки без цели — «обсудить с РОПом»', () => {
        expect(evaluate(issue(), [4.2, 4.4, 4.5])).toMatchObject({
            evaluations: 3,
            lifecycle: DIGEST_LIFECYCLE.escalated,
            hold: false,
        });
        // Данные были хотя бы в одной оценке — тоже «обсудить».
        expect(evaluate(issue(), [null, 4.2, null]).lifecycle).toBe(
            DIGEST_LIFECYCLE.escalated,
        );
    });

    it('три оценки без данных — «снята: данных не было», дальше не переносится', () => {
        const dropped = evaluate(issue(), [null, null, null]);
        expect(dropped).toMatchObject({
            evaluations: 3,
            status: DIGEST_STATUS.noData,
            lifecycle: DIGEST_LIFECYCLE.dropped,
            hold: false,
        });

        expect(
            carryDigestRecommendations(
                [dropped],
                () => ({ value: 9, n: 6 }),
                '2027-02',
                OPTIONS,
            ),
        ).toEqual([]);
    });

    it('период без данных — оценка «данных мало», опора — последнее известное значение', () => {
        const quiet = evaluate(issue(), [null]);
        expect(quiet).toMatchObject({
            status: DIGEST_STATUS.noData,
            evaluations: 1,
            lifecycle: DIGEST_LIFECYCLE.active,
        });
        expect(quiet.history[1]).toEqual({
            periodKey: '2026-11',
            value: null,
            n: 0,
            status: DIGEST_STATUS.noData,
            achieved: false,
        });

        // Опора второй оценки — база 4 (у ноября значения нет): 4,6 — лучше.
        expect(evaluate(issue(), [null, 4.6]).status).toBe(
            DIGEST_STATUS.improved,
        );
    });

    it('пересчёт того же периода и закрытая рекомендация не меняются', () => {
        const first = evaluate(issue(), [5.2]);
        expect(
            evaluateDigestRecommendation(
                first,
                { value: 1, n: 6 },
                '2026-11',
                OPTIONS,
            ),
        ).toBe(first);

        const escalated = evaluate(issue(), [4.2, 4.4, 4.5]);
        expect(
            evaluateDigestRecommendation(
                escalated,
                { value: 9, n: 6 },
                '2027-02',
                OPTIONS,
            ),
        ).toBe(escalated);
    });
});

describe('набор рекомендаций карточки', () => {
    const code = DIGEST_RECOMMENDATION_CODE;

    it('переносятся и оцениваются только активные', () => {
        const active = issue();
        const fixed = evaluate(issue({ code: code.nextStepDated }), [5.2, 5.1]);
        const measure = jest.fn(() => ({ value: 4.6, n: 6 }));

        const carried = carryDigestRecommendations(
            [active, fixed],
            measure,
            '2026-11',
            OPTIONS,
        );

        expect(carried.map(item => item.code)).toEqual([
            code.presentationNeeds,
        ]);
        expect(carried[0].status).toBe(DIGEST_STATUS.improved);
        expect(measure).toHaveBeenCalledWith(NEEDS_ANCHOR);
    });

    it('перенесённые первыми, новые — на свободные места, активных не больше трёх', () => {
        const carriedActive = issue({ code: code.presentationNeeds });
        const closedNow = evaluate(
            issue({ code: code.lowScoreCalls }),
            [5.2, 5.1],
        );
        const fresh = [
            issue({ code: code.presentationNeeds }),
            issue({ code: code.followupObjections }),
            issue({ code: code.nextStepDated }),
            issue({ code: code.worstSection }),
        ];

        expect(
            mergeDigestRecommendations([carriedActive, closedNow], fresh).map(
                item => item.code,
            ),
        ).toEqual([
            code.presentationNeeds,
            code.lowScoreCalls,
            code.followupObjections,
            code.nextStepDated,
        ]);
    });

    it('три активных перенесённых — новых нет', () => {
        const carried = [
            issue({ code: code.presentationNeeds }),
            issue({ code: code.presentationFit }),
            issue({ code: code.followupStepDate }),
        ];

        expect(
            mergeDigestRecommendations(carried, [
                issue({ code: code.worstSection }),
            ]),
        ).toHaveLength(3);
    });
});
