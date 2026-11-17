import {
    LATIN_OR_CODE,
    digestCalls,
    digestContextOf,
    runDigestModule,
    sectionAsWas,
} from '../../__tests__/digest-context.fixture';
import { presentationFitModule } from '../presentation-fit.module';

const presentations = (scores: readonly number[]) =>
    digestCalls('p', 'presentation', scores.length, index => ({
        sections: [
            sectionAsWas('NEEDS', 7),
            sectionAsWas('PRESENTATION', scores[index]),
        ],
    }));

describe('модуль «Презентация под потребности»', () => {
    it('слабый раздел — цель не дальше порога «слабого» с запасом', () => {
        const result = runDigestModule(
            presentationFitModule,
            digestContextOf(presentations([4, 5, 5, 5, 5])),
        );

        // База 4,8: два шага сдвига — 5,8, но норма (порог 5 + 0,5) ближе.
        expect(result?.detection).toMatchObject({
            anchor: { section: 'PRESENTATION', callTypes: ['presentation'] },
            baseline: { value: 4.8, n: 5 },
            norm: 5.5,
        });
        expect(result?.target).toBe(5.5);
        expect(result?.text).toBe(
            'Показывать только то, что закрывает задачу клиента: ' +
                '«Презентация под потребности» — 4,8 из 10 по 5 презентациям, ' +
                'цель — 5,5.',
        );
        expect(result?.text).not.toMatch(LATIN_OR_CODE);
    });

    it('сильный раздел — молчит, даже если слаб другой', () => {
        expect(
            runDigestModule(
                presentationFitModule,
                digestContextOf(presentations([6, 7, 6, 7, 6])),
            ),
        ).toBeNull();
    });

    it('три формулировки на числах периода', () => {
        const textOf = (scores: readonly number[], benchmark?: number) =>
            runDigestModule(
                presentationFitModule,
                digestContextOf(presentations(scores), {
                    benchmarks: benchmark
                        ? [{ section: 'PRESENTATION', mean: benchmark, n: 20 }]
                        : [],
                }),
            )?.text;

        expect([
            textOf([4, 5, 5, 5, 5]),
            textOf([3, 3, 4, 3, 4, 3]),
            textOf([6, 6, 6, 6, 6], 7.2),
        ]).toEqual([
            'Показывать только то, что закрывает задачу клиента: «Презентация под потребности» — 4,8 из 10 по 5 презентациям, цель — 5,5.',
            'Показывать только то, что закрывает задачу клиента: «Презентация под потребности» — 3,3 из 10 по 6 презентациям, цель — 4,3.',
            'Показывать только то, что закрывает задачу клиента: «Презентация под потребности» — 6,0 из 10 по 5 презентациям, ниже среднего по отделу, цель — 7,0.',
        ]);
    });
});
