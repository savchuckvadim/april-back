import {
    LATIN_OR_CODE,
    digestCalls,
    digestContextOf,
    runDigestModule,
} from '../../__tests__/digest-context.fixture';
import { followupObjectionsModule } from '../followup-objections.module';

const objection = (handled: boolean, quote: string | null = null) => ({
    category: 'price',
    quote,
    handled,
    outcome: null,
});

/** Доработки по четыре возражения; unhandled[i] — без ответа в i-й. */
const followups = (unhandled: readonly number[]) =>
    digestCalls('r', 'refine', unhandled.length, index => ({
        objections: [0, 1, 2, 3].map(slot =>
            slot < unhandled[index]
                ? objection(false, index === 1 ? 'Дорого для нас' : null)
                : objection(true),
        ),
    }));

describe('модуль «возражения на доработке»', () => {
    it('без ответа не меньше половины — рекомендация, цель не дальше порога с запасом', () => {
        const result = runDigestModule(
            followupObjectionsModule,
            digestContextOf(followups([3, 2, 2, 2, 2])),
        );

        expect(result?.detection).toMatchObject({
            anchor: { metric: 'objection_unhandled_share' },
            baseline: { value: 0.55, n: 20 },
            evidence: {
                transcriptionIds: ['r1', 'r2', 'r3', 'r4', 'r5'],
                quote: 'Дорого для нас',
            },
        });
        expect(result?.detection.norm).toBeCloseTo(0.4);
        expect(result?.target).toBeCloseTo(0.4);
        expect(result?.text).toBe(
            'Отвечать на каждое возражение на доработке: без ответа осталось ' +
                '11 из 20 возражений (55 %), цель — не больше 40 %.',
        );
        expect(result?.text).not.toMatch(LATIN_OR_CODE);
    });

    it('без ответа меньше половины или возражений меньше минимума — молчит', () => {
        expect(
            runDigestModule(
                followupObjectionsModule,
                digestContextOf(followups([2, 2, 1, 1, 2])),
            ),
        ).toBeNull();
        const few = digestCalls('r', 'refine', 2, () => ({
            objections: [objection(false), objection(false)],
        }));
        expect(
            runDigestModule(followupObjectionsModule, digestContextOf(few)),
        ).toBeNull();
    });

    it('три формулировки на числах периода', () => {
        const single = digestCalls('d', 'decision', 6, index => ({
            objections: [objection(index >= 4)],
        }));
        const textOf = (rows: ReturnType<typeof digestCalls>) =>
            runDigestModule(followupObjectionsModule, digestContextOf(rows))
                ?.text;

        expect([
            textOf(followups([3, 2, 2, 2, 2])),
            textOf(followups([4, 4, 4, 4, 3])),
            textOf(single),
        ]).toEqual([
            'Отвечать на каждое возражение на доработке: без ответа осталось 11 из 20 возражений (55 %), цель — не больше 40 %.',
            'Отвечать на каждое возражение на доработке: без ответа осталось 19 из 20 возражений (95 %), цель — не больше 75 %.',
            'Отвечать на каждое возражение на доработке: без ответа осталось 4 из 6 возражений (67 %), цель — не больше 47 %.',
        ]);
    });
});
