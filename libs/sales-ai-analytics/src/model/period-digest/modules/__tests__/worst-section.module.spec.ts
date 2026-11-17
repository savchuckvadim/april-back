import {
    LATIN_OR_CODE,
    digestCalls,
    digestContextOf,
    runDigestModule,
    sectionAsWas,
} from '../../__tests__/digest-context.fixture';
import type { DigestModuleContext } from '../digest-module.types';
import { worstSectionModule } from '../worst-section.module';

const calls = digestCalls('c', 'call', 6, index => ({
    sections: [
        sectionAsWas(
            'PRICE',
            [4, 5, 5, 5, 5, 6][index],
            index === 0 ? 'Это наша цена, скидок нет' : null,
        ),
    ],
}));

/** Положение худшего раздела в отделе. */
function withStanding(
    context: DigestModuleContext,
    position: 'below' | 'middle',
): DigestModuleContext {
    return {
        ...context,
        metrics: {
            ...context.metrics,
            sections: context.metrics.sections.map(item => ({
                ...item,
                standing: { position, scope: 'department', middle: 6.5 },
            })),
        },
    };
}

describe('запасной модуль «худший раздел»', () => {
    it('худший раздел ниже середины отдела — подтянуть до середины', () => {
        const result = runDigestModule(
            worstSectionModule,
            withStanding(digestContextOf(calls), 'below'),
        );

        expect(result?.detection).toMatchObject({
            anchor: { metric: 'section_mean', section: 'PRICE' },
            baseline: { value: 5, n: 6 },
            norm: 6.5,
            evidence: { quote: 'Это наша цена, скидок нет' },
        });
        expect(result?.detection.evidence.transcriptionIds[0]).toBe('c1');
        expect(result?.target).toBe(6);
        expect(result?.text).toBe(
            'Подтянуть раздел «Работа по цене»: 5,0 из 10 по 6 звонкам, ' +
                'ниже середины отдела, цель — 6,0.',
        );
        expect(result?.text).not.toMatch(LATIN_OR_CODE);
        expect(
            worstSectionModule.weekAction({
                metric: 'section_mean',
                section: 'PRICE',
            }),
        ).toBe('Подтянуть раздел «Работа по цене»');
    });

    it('около середины или сравнения нет — молчит', () => {
        expect(
            runDigestModule(
                worstSectionModule,
                withStanding(digestContextOf(calls), 'middle'),
            ),
        ).toBeNull();
        expect(
            runDigestModule(worstSectionModule, digestContextOf(calls)),
        ).toBeNull();
    });

    it('три формулировки на числах периода', () => {
        const textOf = (
            section: string,
            scores: readonly number[],
            middle: number,
            scope: 'department' | 'structure',
        ) => {
            const context = digestContextOf(
                digestCalls('s', 'call', scores.length, index => ({
                    sections: [sectionAsWas(section, scores[index])],
                })),
            );
            return runDigestModule(worstSectionModule, {
                ...context,
                metrics: {
                    ...context.metrics,
                    sections: context.metrics.sections.map(item => ({
                        ...item,
                        standing: { position: 'below' as const, scope, middle },
                    })),
                },
            })?.text;
        };

        expect([
            textOf('PRICE', [4, 5, 5, 5, 5, 6], 6.5, 'department'),
            textOf('OBJECTIONS', [3, 4, 4, 4, 5], 4.8, 'structure'),
            textOf('GREETING', [6, 6, 7, 6, 6, 7, 6], 7.5, 'department'),
        ]).toEqual([
            'Подтянуть раздел «Работа по цене»: 5,0 из 10 по 6 звонкам, ниже середины отдела, цель — 6,0.',
            'Подтянуть раздел «Работа с возражениями»: 4,0 из 10 по 5 звонкам, ниже середины по отделам продаж, цель — 4,8.',
            'Подтянуть раздел «Приветствие»: 6,3 из 10 по 7 звонкам, ниже середины отдела, цель — 7,3.',
        ]);
    });
});
