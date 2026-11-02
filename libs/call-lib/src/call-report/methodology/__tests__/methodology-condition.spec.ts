import {
    evaluateAll,
    evaluateCondition,
    type MethodologyConditionContext,
} from '../methodology-condition';

const context = (
    over: Partial<MethodologyConditionContext> = {},
): MethodologyConditionContext => ({
    facts: {
        needsFound: false,
        presentationDone: true,
        nextStepSet: true,
        nextStepDate: null,
        talkRatioPct: 72,
        spiralsFull: 2,
        spiralsWithoutNeed: 0,
        interlocutorRole: '',
    },
    norms: { talkRatioPct: 60 },
    checkpoints: {
        'pres.feedback_per_block': 'missed',
        'cold.utp_cta': 'done',
    },
    ...over,
});

/**
 * Вычисление условий по фактам разбора: равенство, пустота, числа, нормы
 * типа, статусы пунктов; неизвестный факт сравнения не включает, а
 * `empty` — включает; И по списку, пустой список — ложь.
 */
describe('evaluateCondition', () => {
    it('is / not — равенство значению, неизвестный факт не срабатывает', () => {
        expect(
            evaluateCondition(
                { op: 'is', field: 'needsFound', value: false },
                context(),
            ),
        ).toBe(true);
        expect(
            evaluateCondition(
                { op: 'not', field: 'needsFound', value: false },
                context(),
            ),
        ).toBe(false);
        expect(
            evaluateCondition(
                { op: 'is', field: 'nextStepDate', value: null },
                context(),
            ),
        ).toBe(true);
        expect(
            evaluateCondition(
                { op: 'is', field: 'dealProgressScore', value: 1 },
                context(),
            ),
        ).toBe(false);
        expect(
            evaluateCondition(
                { op: 'not', field: 'dealProgressScore', value: 1 },
                context(),
            ),
        ).toBe(false);
    });

    it('empty / not_empty — null, пустая строка, ноль и неизвестный факт пусты', () => {
        expect(
            evaluateCondition(
                { op: 'empty', field: 'nextStepDate' },
                context(),
            ),
        ).toBe(true);
        expect(
            evaluateCondition(
                { op: 'empty', field: 'interlocutorRole' },
                context(),
            ),
        ).toBe(true);
        expect(
            evaluateCondition(
                { op: 'empty', field: 'spiralsWithoutNeed' },
                context(),
            ),
        ).toBe(true);
        expect(
            evaluateCondition(
                { op: 'empty', field: 'dealProgressScore' },
                context(),
            ),
        ).toBe(true);
        expect(
            evaluateCondition(
                { op: 'not_empty', field: 'talkRatioPct' },
                context(),
            ),
        ).toBe(true);
        expect(
            evaluateCondition(
                { op: 'not_empty', field: 'nextStepDate' },
                context(),
            ),
        ).toBe(false);
    });

    it('числовые сравнения только над числами', () => {
        expect(
            evaluateCondition(
                { op: 'gte', field: 'spiralsFull', value: 3 },
                context(),
            ),
        ).toBe(false);
        expect(
            evaluateCondition(
                { op: 'lt', field: 'spiralsFull', value: 3 },
                context(),
            ),
        ).toBe(true);
        expect(
            evaluateCondition(
                { op: 'lte', field: 'spiralsFull', value: 2 },
                context(),
            ),
        ).toBe(true);
        expect(
            evaluateCondition(
                { op: 'gt', field: 'spiralsWithoutNeed', value: 0 },
                context(),
            ),
        ).toBe(false);
        expect(
            evaluateCondition(
                { op: 'gt', field: 'interlocutorRole', value: 0 },
                context(),
            ),
        ).toBe(false);
    });

    it('нормы типа: above_norm / within_norm, без нормы — не срабатывают', () => {
        expect(
            evaluateCondition(
                { op: 'above_norm', field: 'talkRatioPct' },
                context(),
            ),
        ).toBe(true);
        expect(
            evaluateCondition(
                { op: 'within_norm', field: 'talkRatioPct' },
                context(),
            ),
        ).toBe(false);
        expect(
            evaluateCondition(
                { op: 'above_norm', field: 'talkRatioPct' },
                context({ norms: {} }),
            ),
        ).toBe(false);
        expect(
            evaluateCondition(
                { op: 'within_norm', field: 'talkRatioPct' },
                context({ norms: {} }),
            ),
        ).toBe(false);
    });

    it('статусы пунктов: checkpoint_missed / checkpoint_done, неизвестный пункт — ложь', () => {
        expect(
            evaluateCondition(
                {
                    op: 'checkpoint_missed',
                    checkpoint: 'pres.feedback_per_block',
                },
                context(),
            ),
        ).toBe(true);
        expect(
            evaluateCondition(
                { op: 'checkpoint_done', checkpoint: 'cold.utp_cta' },
                context(),
            ),
        ).toBe(true);
        expect(
            evaluateCondition(
                { op: 'checkpoint_missed', checkpoint: 'cold.utp_cta' },
                context(),
            ),
        ).toBe(false);
        expect(
            evaluateCondition(
                { op: 'checkpoint_done', checkpoint: 'nope' },
                context(),
            ),
        ).toBe(false);
    });
});

describe('evaluateAll', () => {
    it('И по всем условиям; пустой список — ложь', () => {
        expect(
            evaluateAll(
                [
                    { op: 'is', field: 'needsFound', value: false },
                    { op: 'is', field: 'presentationDone', value: true },
                ],
                context(),
            ),
        ).toBe(true);
        expect(
            evaluateAll(
                [
                    { op: 'is', field: 'needsFound', value: false },
                    { op: 'gte', field: 'spiralsFull', value: 3 },
                ],
                context(),
            ),
        ).toBe(false);
        expect(evaluateAll([], context())).toBe(false);
    });
});
