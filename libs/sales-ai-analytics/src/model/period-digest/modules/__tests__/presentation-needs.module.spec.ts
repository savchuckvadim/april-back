import {
    LATIN_OR_CODE,
    digestCalls,
    digestContextOf,
    runDigestModule,
    sectionAsWas,
} from '../../__tests__/digest-context.fixture';
import { presentationNeedsModule } from '../presentation-needs.module';

const presentations = (
    scores: readonly number[],
    quote: string | null = null,
) =>
    digestCalls('p', 'presentation', scores.length, index => ({
        sections: [
            sectionAsWas('NEEDS', scores[index], index === 0 ? quote : null),
        ],
    }));

describe('модуль «Выявление потребностей» на презентациях', () => {
    it('слабый раздел — рекомендация, цель на два шага сдвига', () => {
        const result = runDigestModule(
            presentationNeedsModule,
            digestContextOf(
                presentations([3, 4, 4, 5, 5], 'Давайте я сразу покажу'),
            ),
        );

        expect(result?.detection).toMatchObject({
            anchor: {
                metric: 'section_mean',
                section: 'NEEDS',
                callTypes: ['presentation'],
            },
            baseline: { value: 4.2, n: 5 },
            norm: 5.5,
            evidence: {
                transcriptionIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
                quote: 'Давайте я сразу покажу',
            },
        });
        expect(result?.target).toBeCloseTo(5.2);
        expect(result?.text).toBe(
            'Выяснять задачи клиента до показа: «Выявление потребностей» — ' +
                '4,2 из 10 по 5 презентациям, цель — 5,2.',
        );
        expect(result?.text).not.toMatch(LATIN_OR_CODE);
    });

    it('ниже среднего по отделу на разрыв — сравнение словами, цель не дальше отдела', () => {
        const result = runDigestModule(
            presentationNeedsModule,
            digestContextOf(presentations([5, 5, 6, 6, 5]), {
                benchmarks: [{ section: 'NEEDS', mean: 6.5, n: 20 }],
            }),
        );

        expect(result?.detection.norm).toBe(6.5);
        expect(result?.target).toBeCloseTo(6.4);
        expect(result?.text).toBe(
            'Выяснять задачи клиента до показа: «Выявление потребностей» — ' +
                '5,4 из 10 по 5 презентациям, ниже среднего по отделу, цель — 6,4.',
        );
    });

    it('раздел не слабый или презентаций меньше минимума — молчит', () => {
        expect(
            runDigestModule(
                presentationNeedsModule,
                digestContextOf(presentations([6, 6, 7, 6, 6])),
            ),
        ).toBeNull();
        expect(
            runDigestModule(
                presentationNeedsModule,
                digestContextOf(presentations([3, 3, 3, 3])),
            ),
        ).toBeNull();
    });

    it('неделя: минимум — три презентации', () => {
        const result = runDigestModule(
            presentationNeedsModule,
            digestContextOf(presentations([4, 4, 4]), {}, 'week'),
        );

        const anchor = result?.detection.anchor;
        expect(result?.detection.baseline).toEqual({ value: 4, n: 3 });
        expect(anchor && presentationNeedsModule.weekAction(anchor)).toBe(
            'Выяснять задачи клиента до показа',
        );
    });

    it('три формулировки на числах периода', () => {
        const textOf = (scores: readonly number[], benchmark?: number) =>
            runDigestModule(
                presentationNeedsModule,
                digestContextOf(presentations(scores), {
                    benchmarks: benchmark
                        ? [{ section: 'NEEDS', mean: benchmark, n: 20 }]
                        : [],
                }),
            )?.text;

        expect([
            textOf([3, 4, 4, 5, 5]),
            textOf([5, 5, 6, 6, 5], 6.5),
            textOf([2, 3, 3, 4, 4, 3, 2, 3]),
        ]).toEqual([
            'Выяснять задачи клиента до показа: «Выявление потребностей» — 4,2 из 10 по 5 презентациям, цель — 5,2.',
            'Выяснять задачи клиента до показа: «Выявление потребностей» — 5,4 из 10 по 5 презентациям, ниже среднего по отделу, цель — 6,4.',
            'Выяснять задачи клиента до показа: «Выявление потребностей» — 3,0 из 10 по 8 презентациям, цель — 4,0.',
        ]);
    });
});
