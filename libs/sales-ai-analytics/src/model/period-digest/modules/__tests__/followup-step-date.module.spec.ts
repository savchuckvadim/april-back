import {
    LATIN_OR_CODE,
    digestCalls,
    digestContextOf,
    runDigestModule,
} from '../../__tests__/digest-context.fixture';
import { followupStepDateModule } from '../followup-step-date.module';

/** Пять доработок с назначенным шагом; первые noDate — без даты. */
const followups = (noDate: number) =>
    digestCalls('r', 'refine', 5, index => ({
        nextStep: { set: true, date: index < noDate ? null : '2026-10-20' },
    }));

describe('модуль «дата следующего шага на доработке»', () => {
    it('шаг без даты не реже половины — рекомендация', () => {
        const result = runDigestModule(
            followupStepDateModule,
            digestContextOf(followups(3)),
        );

        expect(result?.detection).toMatchObject({
            anchor: { metric: 'followup_step_no_date_share' },
            baseline: { value: 0.6, n: 5 },
            evidence: { transcriptionIds: ['r1', 'r2', 'r3'], quote: null },
        });
        expect(result?.target).toBeCloseTo(0.4);
        expect(result?.text).toBe(
            'Завершать каждую доработку датой следующего шага: без даты 3 из ' +
                '5 назначенных шагов (60 %), цель — не больше 40 %.',
        );
        expect(result?.text).not.toMatch(LATIN_OR_CODE);
    });

    it('шагов без даты меньше половины — молчит; презентации не считаются', () => {
        expect(
            runDigestModule(
                followupStepDateModule,
                digestContextOf(followups(2)),
            ),
        ).toBeNull();
        const presentations = digestCalls('p', 'presentation', 5, () => ({
            nextStep: { set: true, date: null },
        }));
        expect(
            runDigestModule(
                followupStepDateModule,
                digestContextOf(presentations),
            ),
        ).toBeNull();
    });

    it('три формулировки на числах периода', () => {
        const textOf = (noDate: number, total: number) =>
            runDigestModule(
                followupStepDateModule,
                digestContextOf(
                    digestCalls('r', 'refine', total, index => ({
                        nextStep: {
                            set: true,
                            date: index < noDate ? null : '2026-10-20',
                        },
                    })),
                ),
            )?.text;

        expect([textOf(3, 5), textOf(5, 5), textOf(7, 12)]).toEqual([
            'Завершать каждую доработку датой следующего шага: без даты 3 из 5 назначенных шагов (60 %), цель — не больше 40 %.',
            'Завершать каждую доработку датой следующего шага: без даты 5 из 5 назначенных шагов (100 %), цель — не больше 80 %.',
            'Завершать каждую доработку датой следующего шага: без даты 7 из 12 назначенных шагов (58 %), цель — не больше 40 %.',
        ]);
    });
});
