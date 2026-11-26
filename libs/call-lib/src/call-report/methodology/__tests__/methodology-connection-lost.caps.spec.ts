import {
    LOST,
    NOT_LOST,
    codesOf,
    coreOnly,
    evaluate,
    view,
} from './methodology-connection-lost.fixtures';

/**
 * Обрыв связи — не вина менеджера (26.11.2026): при отмеченном обрыве
 * ограничители «про конец разговора» не срабатывают; остальные — как раньше.
 */

describe('ограничители ядра при обрыве связи', () => {
    const END_CAPS = [
        'core.next_step_incomplete',
        'core.info_promise_without_date',
        'core.no_action_offered',
        'core.decision_process_unknown',
    ];

    it('без обрыва все четыре ограничителя про конец разговора срабатывают и срезают закрытие', () => {
        for (const flag of [{}, NOT_LOST]) {
            const result = coreOnly(view(flag));
            expect(codesOf(result)).toEqual(expect.arrayContaining(END_CAPS));
            expect(
                result.sections.find(item => item.section === 'CLOSING')?.score,
            ).toBe(5);
        }
    });

    it('при обрыве они молчат: в списке сработавших их нет, оценки закрытия и итога не срезаны', () => {
        const result = coreOnly(view(LOST));

        for (const code of END_CAPS)
            expect(codesOf(result)).not.toContain(code);
        expect(
            result.sections.find(item => item.section === 'CLOSING')?.score,
        ).toBe(8);
        expect(result.score).toBe(8);
    });

    it('«презентация без потребностей» не про конец разговора: работает как раньше и при обрыве', () => {
        const noNeeds = { needsFound: false, presentationDone: true };

        expect(codesOf(coreOnly(view({ ...noNeeds, ...NOT_LOST })))).toContain(
            'core.presentation_without_needs',
        );
        const lost = coreOnly(view({ ...noNeeds, ...LOST }));
        expect(codesOf(lost)).toContain('core.presentation_without_needs');
        expect(
            lost.sections.find(item => item.section === 'PRESENTATION')?.score,
        ).toBe(6);
    });
});

describe('ограничители методики при обрыве связи', () => {
    it('без обрыва срабатывают все ограничители образца', () => {
        expect(codesOf(evaluate(view(NOT_LOST))).sort()).toEqual(
            [
                't.price_plain',
                't.summary_missed',
                't.target_closing',
                't.target_refusal',
                't.total_step_date',
            ].sort(),
        );
    });

    it('при обрыве молчат ограничители с целью «закрытие» и «отказ» и с условием на следующий шаг', () => {
        const codes = codesOf(evaluate(view(LOST)));

        expect(codes).not.toContain('t.target_closing');
        expect(codes).not.toContain('t.target_refusal');
        expect(codes).not.toContain('t.total_step_date');
    });

    it('остальные ограничители работают как раньше: цель «цена» и условие на другой факт', () => {
        const result = evaluate(view(LOST));

        expect(codesOf(result)).toContain('t.price_plain');
        expect(
            result.sections.find(item => item.section === 'PRICE')?.score,
        ).toBe(5);
    });

    it('срез оценки закрытия при обрыве не происходит', () => {
        const result = evaluate(view(LOST));

        expect(
            result.sections.find(item => item.section === 'CLOSING')?.score,
        ).toBe(8);
    });
});
