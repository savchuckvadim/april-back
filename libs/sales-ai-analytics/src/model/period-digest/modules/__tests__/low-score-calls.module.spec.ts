import {
    LATIN_OR_CODE,
    digestCalls,
    digestContextOf,
    runDigestModule,
} from '../../__tests__/digest-context.fixture';
import { lowScoreCallsModule } from '../low-score-calls.module';

/** Звонки с оценками из 100. */
const calls = (scores: readonly number[]) =>
    digestCalls('c', 'call', scores.length, index => ({
        score: scores[index],
    }));

describe('модуль «звонки с низкой оценкой»', () => {
    it('слабых не меньше порога сдвига — рекомендация, примеры худшие первыми', () => {
        const result = runDigestModule(
            lowScoreCallsModule,
            digestContextOf(calls([40, 70, 30, 70, 35, 70, 40, 70, 70, 70])),
        );

        expect(result?.detection).toMatchObject({
            anchor: { metric: 'low_score_share' },
            baseline: { value: 0.4, n: 10 },
            norm: null,
            evidence: {
                transcriptionIds: ['c3', 'c5', 'c1', 'c7'],
                quote: null,
            },
        });
        expect(result?.target).toBeCloseTo(0.2);
        expect(result?.text).toBe(
            'Разобрать с руководителем звонки с низкой оценкой: оценка не ' +
                'выше 4 из 10 у 4 из 10 звонков (40 %), цель — не больше 20 %.',
        );
        expect(result?.text).not.toMatch(LATIN_OR_CODE);
    });

    it('слабых нет или их доля меньше порога сдвига — молчит', () => {
        expect(
            runDigestModule(
                lowScoreCallsModule,
                digestContextOf(calls([70, 70, 70, 70, 70])),
            ),
        ).toBeNull();
        expect(
            runDigestModule(
                lowScoreCallsModule,
                digestContextOf(calls([30, ...Array<number>(11).fill(70)])),
            ),
        ).toBeNull();
    });

    it('три формулировки на числах периода', () => {
        const textOf = (scores: readonly number[]) =>
            runDigestModule(lowScoreCallsModule, digestContextOf(calls(scores)))
                ?.text;
        const strong = (count: number) => Array<number>(count).fill(70);

        expect([
            textOf([40, 70, 30, 70, 35, 70, 40, 70, 70, 70]),
            textOf([30, 40, ...strong(10)]),
            textOf([30, 30, 40, 40, 35, 35, ...strong(14)]),
        ]).toEqual([
            'Разобрать с руководителем звонки с низкой оценкой: оценка не выше 4 из 10 у 4 из 10 звонков (40 %), цель — не больше 20 %.',
            'Разобрать с руководителем звонки с низкой оценкой: оценка не выше 4 из 10 у 2 из 12 звонков (17 %), цель — ни одного такого звонка.',
            'Разобрать с руководителем звонки с низкой оценкой: оценка не выше 4 из 10 у 6 из 20 звонков (30 %), цель — не больше 10 %.',
        ]);
    });
});
