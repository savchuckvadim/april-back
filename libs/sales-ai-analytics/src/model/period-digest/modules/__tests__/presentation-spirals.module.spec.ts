import {
    LATIN_OR_CODE,
    digestCalls,
    digestContextOf,
    runDigestModule,
} from '../../__tests__/digest-context.fixture';
import { presentationSpiralsModule } from '../presentation-spirals.module';

const presentations = (spirals: readonly number[], minFull = 2) =>
    digestCalls('p', 'presentation', spirals.length, index => ({
        methodology: {
            code: 'polyansky',
            checkpointsDone: null,
            checkpointsTotal: null,
            spiralsFull: spirals[index],
            spiralsMinFull: minFull,
            dealProgress: null,
            capsApplied: 0,
        },
    }));

describe('модуль «спирали презентации»', () => {
    it('полных спиралей меньше нормы методики — рекомендация', () => {
        const result = runDigestModule(
            presentationSpiralsModule,
            digestContextOf(presentations([0, 1, 1, 1, 1])),
        );

        expect(result?.detection).toMatchObject({
            anchor: { metric: 'spirals_full_mean' },
            baseline: { value: 0.8, n: 5 },
            norm: 2,
            evidence: { transcriptionIds: ['p1', 'p2', 'p3', 'p4', 'p5'] },
        });
        expect(result?.target).toBeCloseTo(1.8);
        expect(result?.text).toBe(
            'Проходить спираль до конца — потребность, свойство, связка, ' +
                'выгода, вопрос: в среднем 0,8 полной спирали на презентацию ' +
                'по 5 презентациям при норме 2, цель — 1,8.',
        );
        expect(result?.text).not.toMatch(LATIN_OR_CODE);
    });

    it('норма ближе двух шагов сдвига — цель по норме', () => {
        const result = runDigestModule(
            presentationSpiralsModule,
            digestContextOf(presentations([1, 1, 2, 1, 2])),
        );

        // База 1,4: два шага — 2,4, но норма методики 2 ближе.
        expect(result?.detection.baseline.value).toBe(1.4);
        expect(result?.target).toBe(2);
        expect(result?.text).toContain(
            'в среднем 1,4 полной спирали на презентацию по 5 презентациям ' +
                'при норме 2, цель — 2,0.',
        );
        // В примерах — только презентации ниже нормы.
        expect(result?.detection.evidence.transcriptionIds).toEqual([
            'p1',
            'p2',
            'p4',
        ]);
    });

    it('спирали не считались или в норме — молчит', () => {
        expect(
            runDigestModule(
                presentationSpiralsModule,
                digestContextOf(digestCalls('p', 'presentation', 5)),
            ),
        ).toBeNull();
        expect(
            runDigestModule(
                presentationSpiralsModule,
                digestContextOf(presentations([2, 2, 3, 2, 2])),
            ),
        ).toBeNull();
    });

    it('три формулировки на числах периода', () => {
        const textOf = (spirals: readonly number[], minFull = 2) =>
            runDigestModule(
                presentationSpiralsModule,
                digestContextOf(presentations(spirals, minFull)),
            )?.text;

        expect([
            textOf([0, 1, 1, 1, 1]),
            textOf([1, 1, 2, 1, 2]),
            textOf([0, 0, 1, 0, 0, 1, 0], 3),
        ]).toEqual([
            'Проходить спираль до конца — потребность, свойство, связка, выгода, вопрос: в среднем 0,8 полной спирали на презентацию по 5 презентациям при норме 2, цель — 1,8.',
            'Проходить спираль до конца — потребность, свойство, связка, выгода, вопрос: в среднем 1,4 полной спирали на презентацию по 5 презентациям при норме 2, цель — 2,0.',
            'Проходить спираль до конца — потребность, свойство, связка, выгода, вопрос: в среднем 0,3 полной спирали на презентацию по 7 презентациям при норме 3, цель — 1,3.',
        ]);
    });
});
