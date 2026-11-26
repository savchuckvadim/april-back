import { evaluateMethodology } from '../methodology-evaluate';
import type { MethodologyAnalysisView } from '../methodology-result.types';
import { POLYANSKY_METHODOLOGY } from '../polyansky.methodology';
import {
    LOST,
    NOT_LOST,
    codesOf,
    pass,
    view,
} from './methodology-connection-lost.fixtures';

/**
 * Встроенная методика при обрыве связи (26.11.2026): пункты о завершении
 * разговора — попытка закрытия и срок оплаты и решения — при обрыве не
 * засчитываются как пропуск, и потолки итога за них не срабатывают.
 */

const evaluatePolyansky = (
    analysis: MethodologyAnalysisView,
    answers: Record<string, 'done' | 'missed'>,
) =>
    evaluateMethodology({
        view: analysis,
        methodology: POLYANSKY_METHODOLOGY,
        pass: pass(answers),
        coreCaps: [],
        norms: {},
    });

const statusOf = (result: ReturnType<typeof evaluatePolyansky>, code: string) =>
    result.methodology?.checkpoints.find(item => item.code === code)?.status;

describe('встроенная методика Полянского при обрыве связи', () => {
    const repeatCall = (over: Partial<MethodologyAnalysisView>) =>
        view({ callType: 'refine', ...over });
    const formalWithoutClose = {
        'rep.no_formal_question': 'missed',
        'rep.close_attempt': 'missed',
    } as const;

    it('повторный звонок без обрыва: нет попытки закрытия — потолки итога срабатывают', () => {
        const result = evaluatePolyansky(
            repeatCall(NOT_LOST),
            formalWithoutClose,
        );

        expect(statusOf(result, 'rep.close_attempt')).toBe('missed');
        expect(codesOf(result)).toEqual(
            expect.arrayContaining(['rep.formal_only', 'rep.no_close_attempt']),
        );
    });

    it('повторный звонок оборвался: попытка закрытия «не применимо», потолки итога за неё молчат', () => {
        const result = evaluatePolyansky(repeatCall(LOST), formalWithoutClose);

        expect(statusOf(result, 'rep.close_attempt')).toBe('not_applicable');
        // Формальный вопрос — не про конец разговора: он остаётся пропуском.
        expect(statusOf(result, 'rep.no_formal_question')).toBe('missed');
        expect(codesOf(result)).not.toContain('rep.formal_only');
        expect(codesOf(result)).not.toContain('rep.no_close_attempt');
    });

    it('презентация оборвалась: срок оплаты и решения «не применимо», без обрыва — пропуск', () => {
        const answers = { 'pres.payment_when': 'missed' } as const;

        expect(
            statusOf(
                evaluatePolyansky(view(LOST), answers),
                'pres.payment_when',
            ),
        ).toBe('not_applicable');
        expect(
            statusOf(
                evaluatePolyansky(view(NOT_LOST), answers),
                'pres.payment_when',
            ),
        ).toBe('missed');
    });

    it('выполненная попытка закрытия остаётся выполненной и при обрыве', () => {
        const result = evaluatePolyansky(repeatCall(LOST), {
            'rep.close_attempt': 'done',
        });

        expect(statusOf(result, 'rep.close_attempt')).toBe('done');
    });
});
