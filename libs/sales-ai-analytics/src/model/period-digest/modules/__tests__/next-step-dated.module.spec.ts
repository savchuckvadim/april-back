import {
    LATIN_OR_CODE,
    digestCalls,
    digestContextOf,
    runDigestModule,
} from '../../__tests__/digest-context.fixture';
import { nextStepDatedModule } from '../next-step-dated.module';

/** Десять звонков, у первых dated — шаг с датой. */
const calls = (dated: number) =>
    digestCalls('c', 'call', 10, index => ({
        nextStep:
            index < dated
                ? { set: true, date: '2026-10-20' }
                : { set: true, date: null },
    }));

const BELOW_DEPARTMENT = {
    score: null,
    nextStepDated: {
        position: 'below',
        scope: 'department',
        middle: 0.58,
    },
} as const;

const AROUND_DEPARTMENT = {
    score: null,
    nextStepDated: { ...BELOW_DEPARTMENT.nextStepDated, position: 'middle' },
} as const;

describe('модуль «шаг с датой»', () => {
    it('ниже середины отдела — цель не дальше середины', () => {
        const result = runDigestModule(
            nextStepDatedModule,
            digestContextOf(calls(4), { standings: BELOW_DEPARTMENT }),
        );

        expect(result?.detection).toMatchObject({
            anchor: { metric: 'next_step_dated_share' },
            baseline: { value: 0.4, n: 10 },
            norm: 0.58,
            evidence: {
                transcriptionIds: ['c10', 'c5', 'c6', 'c7', 'c8'],
            },
        });
        expect(result?.target).toBe(0.58);
        expect(result?.text).toBe(
            'Договариваться о дате следующего контакта: дата есть в 4 из ' +
                '10 звонков (40 %), ниже середины отдела, цель — 58 %.',
        );
        expect(result?.text).not.toMatch(LATIN_OR_CODE);
    });

    it('упала к прошлому периоду на порог — сравнение с ним', () => {
        const context = digestContextOf(calls(4), {
            standings: AROUND_DEPARTMENT,
        });
        const previous = {
            ...context.metrics,
            nextStepDated: { value: 0.6, n: 12 },
        };

        const month = runDigestModule(nextStepDatedModule, {
            ...context,
            previous,
        });
        expect(month?.target).toBeCloseTo(0.6);
        expect(month?.text).toBe(
            'Договариваться о дате следующего контакта: дата есть в 4 из ' +
                '10 звонков (40 %), месяцем раньше было 60 %, цель — 60 %.',
        );

        const week = runDigestModule(nextStepDatedModule, {
            ...context,
            kind: 'week',
            previous,
        });
        expect(week?.text).toContain('неделей раньше было 60 %');
    });

    it('около середины и без падения — молчит', () => {
        const context = digestContextOf(calls(4), {
            standings: AROUND_DEPARTMENT,
        });
        expect(
            runDigestModule(nextStepDatedModule, {
                ...context,
                previous: {
                    ...context.metrics,
                    nextStepDated: { value: 0.45, n: 12 },
                },
            }),
        ).toBeNull();
        expect(runDigestModule(nextStepDatedModule, context)).toBeNull();
    });

    it('три формулировки на числах периода', () => {
        const month = digestContextOf(calls(4), {
            standings: AROUND_DEPARTMENT,
        });
        const week = digestContextOf(
            calls(4),
            {
                standings: {
                    score: null,
                    nextStepDated: {
                        position: 'below',
                        scope: 'structure',
                        middle: 0.7,
                    },
                },
            },
            'week',
        );

        expect([
            runDigestModule(
                nextStepDatedModule,
                digestContextOf(calls(4), { standings: BELOW_DEPARTMENT }),
            )?.text,
            runDigestModule(nextStepDatedModule, {
                ...month,
                previous: {
                    ...month.metrics,
                    nextStepDated: { value: 0.6, n: 12 },
                },
            })?.text,
            runDigestModule(nextStepDatedModule, {
                ...week,
                previous: {
                    ...week.metrics,
                    nextStepDated: { value: 0.9, n: 8 },
                },
            })?.text,
        ]).toEqual([
            'Договариваться о дате следующего контакта: дата есть в 4 из 10 звонков (40 %), ниже середины отдела, цель — 58 %.',
            'Договариваться о дате следующего контакта: дата есть в 4 из 10 звонков (40 %), месяцем раньше было 60 %, цель — 60 %.',
            'Договариваться о дате следующего контакта: дата есть в 4 из 10 звонков (40 %), ниже середины по отделам продаж, неделей раньше было 90 %, цель — 60 %.',
        ]);
    });
});
