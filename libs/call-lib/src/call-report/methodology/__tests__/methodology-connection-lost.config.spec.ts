import { CORE_CAPS } from '../core-caps.const';
import { evaluateMethodology } from '../methodology-evaluate';
import {
    CONNECTION_LOST_END_FACT_FIELDS,
    isCallEndCap,
    refersToCallEnd,
    ruleEndsCall,
    statusUnderConnectionLost,
} from '../methodology-connection-lost';
import { parseMethodology } from '../methodology.validator';
import { POLYANSKY_METHODOLOGY } from '../polyansky.methodology';
import { METHODOLOGY_FACT_FIELDS } from '../methodology.types';
import {
    LOST,
    NOT_LOST,
    cap,
    codesOf,
    pass,
    point,
    view,
} from './methodology-connection-lost.fixtures';

/**
 * Обрыв связи — не вина менеджера (26.11.2026): признаки «про конец
 * разговора», проверка конфига и встроенная методика Полянского.
 */

describe('признаки «про конец разговора»', () => {
    it('список фактов — ровно тот, что в задании, и все из словаря фактов', () => {
        expect([...CONNECTION_LOST_END_FACT_FIELDS]).toEqual([
            'nextStepSet',
            'nextStepDate',
            'nextStepTime',
            'nextStepGoal',
            'nextStepClientAction',
            'nextStepManagerAction',
            'nextStepComplete',
            'hvostDecisionProcess',
            'hvostDecisionWay',
        ]);
        for (const field of CONNECTION_LOST_END_FACT_FIELDS) {
            expect(METHODOLOGY_FACT_FIELDS).toContain(field);
        }
    });

    it('условия: ссылка на факт о конце — да; другой факт и пункт — нет', () => {
        expect(refersToCallEnd([{ op: 'empty', field: 'nextStepDate' }])).toBe(
            true,
        );
        expect(
            refersToCallEnd([
                { op: 'is', field: 'needsFound', value: false },
                { op: 'is', field: 'hvostDecisionWay', value: false },
            ]),
        ).toBe(true);
        expect(
            refersToCallEnd([{ op: 'is', field: 'needsFound', value: false }]),
        ).toBe(false);
        expect(
            refersToCallEnd([{ op: 'checkpoint_missed', checkpoint: 'x' }]),
        ).toBe(false);
    });

    it('ограничитель про конец: цель CLOSING или REFUSAL либо условие на факт о конце', () => {
        const plain = [
            { op: 'is', field: 'needsFound', value: false },
        ] as const;

        expect(isCallEndCap(cap('a', 'CLOSING', [...plain]))).toBe(true);
        expect(isCallEndCap(cap('a', 'REFUSAL', [...plain]))).toBe(true);
        expect(isCallEndCap(cap('a', 'PRICE', [...plain]))).toBe(false);
        expect(
            isCallEndCap(
                cap('a', 'total', [{ op: 'empty', field: 'nextStepDate' }]),
            ),
        ).toBe(true);
    });

    it('ruleEndsCall и статус при обрыве', () => {
        expect(ruleEndsCall(point('a', { ending: true }))).toBe(true);
        expect(ruleEndsCall(point('a'))).toBe(false);
        expect(statusUnderConnectionLost('missed', true, true)).toBe(
            'not_applicable',
        );
        expect(statusUnderConnectionLost('missed', true, false)).toBe('missed');
        expect(statusUnderConnectionLost('missed', false, true)).toBe('missed');
        expect(statusUnderConnectionLost('done', true, true)).toBe('done');
    });
});

describe('валидатор: признак пункта «о завершении разговора»', () => {
    const config = (ending: unknown) => ({
        code: 'own',
        title: 'Своя',
        types: ['presentation'],
        checkpoints: [
            {
                code: 'end.summary',
                title: 'Резюмировал договорённости',
                types: ['presentation'],
                evidence: 'quote',
                mandatory: true,
                ...(ending === undefined ? {} : { ending }),
            },
        ],
    });

    it('true сохраняется в пункте', () => {
        const result = parseMethodology(config(true));

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.checkpoints[0].ending).toBe(true);
    });

    it('false и отсутствие признака в пункте не остаются', () => {
        for (const value of [false, undefined]) {
            const result = parseMethodology(config(value));
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.checkpoints[0]).not.toHaveProperty(
                    'ending',
                );
            }
        }
    });

    it('не true/false — ошибка с путём и по-русски', () => {
        const result = parseMethodology(config('да'));

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors).toContain(
                'checkpoints[0].ending: укажите true или false',
            );
        }
    });
});

describe('встроенная методика Полянского: пункты о завершении разговора', () => {
    it('отмечены ровно резюме договорённостей, срок оплаты и решения, попытка закрытия и шаги после счёта', () => {
        const ending = POLYANSKY_METHODOLOGY.checkpoints
            .filter(checkpoint => checkpoint.ending === true)
            .map(checkpoint => checkpoint.code);

        expect(ending).toEqual([
            'common.final_summary',
            'pres.payment_when',
            'rep.close_attempt',
            'rep.invoice_followthrough',
        ]);
    });

    it('конфиг проходит проверку и сохраняет признак', () => {
        const result = parseMethodology(
            JSON.parse(JSON.stringify(POLYANSKY_METHODOLOGY)) as unknown,
        );

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value).toEqual(POLYANSKY_METHODOLOGY);
    });

    it('при обрыве холодного звонка ограничители про шаг молчат, диагностика — нет', () => {
        const cold = (flag: object) =>
            evaluateMethodology({
                view: {
                    callType: 'cold',
                    sections: [
                        { section: 'GREETING', relevance: 100, score: 8 },
                        { section: 'CLOSING', relevance: 90, score: 8 },
                    ],
                    score: 8,
                    needsFound: false,
                    interlocutorRole: 'lpr',
                    nextStep: { set: false },
                    ...flag,
                },
                methodology: POLYANSKY_METHODOLOGY,
                pass: null,
                coreCaps: CORE_CAPS,
                norms: {},
            });

        const kept = codesOf(cold(NOT_LOST));
        expect(kept).toEqual(
            expect.arrayContaining(['cold.vague_final', 'cold.no_diagnostics']),
        );
        const lost = codesOf(cold(LOST));
        expect(lost).not.toContain('cold.vague_final');
        expect(lost).not.toContain('cold.no_presentation_slot');
        expect(lost).toContain('cold.no_diagnostics');
    });

    it('при обрыве показа «Резюмировал договорённости» не засчитывается как пропуск', () => {
        const summary = (flag: object) =>
            evaluateMethodology({
                view: view({ ...flag }),
                methodology: POLYANSKY_METHODOLOGY,
                pass: pass({ 'common.final_summary': 'missed' }),
                coreCaps: [],
                norms: {},
            }).methodology?.checkpoints.find(
                item => item.code === 'common.final_summary',
            )?.status;

        expect(summary(NOT_LOST)).toBe('missed');
        expect(summary(LOST)).toBe('not_applicable');
    });
});
