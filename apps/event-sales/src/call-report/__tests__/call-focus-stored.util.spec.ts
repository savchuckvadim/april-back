import {
    focusIncompleteParts,
    mergeFocusResults,
    ownSectionsOf,
} from '../services/call-focus-assemble.util';
import {
    buildStoredFocusPasses,
    parseStoredFocusPasses,
    storedFocusPassCount,
    usableStoredFocusPasses,
    withFocusPasses,
    withoutFocusPasses,
} from '../services/call-focus-stored.util';

const PROMPT = 'focus-v3.5-2026-11-26';
const FORM = {
    sections: [{ section: 'GREETING', score: 7 }],
    sentiment: 'neutral',
};
const CONTENT = {
    sections: [{ section: 'NEEDS', score: 5 }],
    needsFound: true,
};
const CLOSING = {
    sections: [{ section: 'CLOSING', score: 6 }],
    refusalReason: null,
};

describe('call-focus-stored.util — сохранённые ответы проходов', () => {
    it('сохраняются только выжившие проходы; методика — со своей меткой', () => {
        const stored = buildStoredFocusPasses(
            {
                form: FORM,
                content: CONTENT,
                movement: null,
                closing: CLOSING,
            },
            { tag: 'polyansky@1.0.0', result: { checkpoints: [] } },
            PROMPT,
        );

        expect(stored).toEqual({
            promptVersion: PROMPT,
            passes: { form: FORM, content: CONTENT, closing: CLOSING },
            methodology: {
                tag: 'polyansky@1.0.0',
                result: { checkpoints: [] },
            },
        });
        expect(storedFocusPassCount(stored)).toBe(4);
        expect(storedFocusPassCount(null)).toBe(0);
    });

    it('читаются из user_result; кривая форма, пустой набор и чужие ключи — мимо', () => {
        const stored = buildStoredFocusPasses(
            { form: FORM, content: null, movement: null, closing: CLOSING },
            null,
            PROMPT,
        );
        const record = withFocusPasses({ callType: 'cold' }, stored);

        // Проход «закрытие» сохраняется и читается наравне с остальными.
        expect(parseStoredFocusPasses(record)).toEqual(stored);
        expect(parseStoredFocusPasses(record)?.passes.closing).toEqual(CLOSING);
        expect(parseStoredFocusPasses({ callType: 'cold' })).toBeNull();
        expect(
            parseStoredFocusPasses({ extra: { focusPasses: 'x' } }),
        ).toBeNull();
        expect(
            parseStoredFocusPasses({
                extra: { focusPasses: { promptVersion: PROMPT, passes: {} } },
            }),
        ).toBeNull();
        expect(
            parseStoredFocusPasses({
                extra: {
                    focusPasses: {
                        promptVersion: PROMPT,
                        passes: { form: FORM, weird: { a: 1 }, content: 'нет' },
                    },
                },
            }),
        ).toEqual({ promptVersion: PROMPT, passes: { form: FORM } });
        expect(parseStoredFocusPasses(null)).toBeNull();
    });

    it('годятся только проходы текущего промпта', () => {
        const stored = buildStoredFocusPasses(
            { form: FORM, content: null, movement: null, closing: null },
            null,
            'focus-v3-2026-11-01',
        );
        expect(usableStoredFocusPasses(stored, PROMPT)).toBe(false);
        expect(usableStoredFocusPasses(stored, 'focus-v3-2026-11-01')).toBe(
            true,
        );
        expect(usableStoredFocusPasses(null, PROMPT)).toBe(false);
    });

    it('withFocusPasses не трогает остальное; withoutFocusPasses убирает проходы и пустой extra', () => {
        const stored = buildStoredFocusPasses(
            { form: FORM, content: null, movement: null, closing: null },
            null,
            PROMPT,
        );
        const withOther = withFocusPasses(
            { callType: 'cold', extra: { note: 'своё' } },
            stored,
        );
        expect(withOther).toEqual({
            callType: 'cold',
            extra: { note: 'своё', focusPasses: stored },
        });
        expect(withoutFocusPasses(withOther)).toEqual({
            callType: 'cold',
            extra: { note: 'своё' },
        });
        expect(
            withoutFocusPasses(withFocusPasses({ callType: 'cold' }, stored)),
        ).toEqual({ callType: 'cold' });
        // Нечего убирать — та же запись.
        const plain = { callType: 'cold' };
        expect(withoutFocusPasses(plain)).toBe(plain);
    });
});

describe('call-focus-assemble.util — сборка разбора из ответов проходов', () => {
    it('чего не хватает: проходы, синтез и методика, если она ожидалась', () => {
        const byKey = {
            form: FORM,
            content: null,
            movement: {},
            closing: {},
        };
        expect(focusIncompleteParts(byKey, null, true, null)).toEqual([
            'content',
            'synthesis',
            'methodology',
        ]);
        expect(focusIncompleteParts(byKey, { score: 6 }, false, null)).toEqual([
            'content',
        ]);
        expect(
            focusIncompleteParts(
                { form: FORM, content: CONTENT, movement: {}, closing: {} },
                { score: 6 },
                true,
                { checkpoints: [] },
            ),
        ).toEqual([]);
        // Оба прохода «движения сделки» учитываются отдельно, в порядке сборки.
        expect(
            focusIncompleteParts(
                { form: FORM, content: CONTENT, movement: null, closing: null },
                { score: 6 },
                false,
                null,
            ),
        ).toEqual(['movement', 'closing']);
    });

    it('разделы прохода — только своей зоны, чужие коды названы', () => {
        const result = {
            sections: [
                { section: 'GREETING', score: 7 },
                { section: 'NEEDS', score: 4 },
                { score: 1 },
            ],
        };
        expect(ownSectionsOf(result, 'form')).toEqual({
            own: [{ section: 'GREETING', score: 7 }],
            foreign: ['NEEDS', ''],
        });
        expect(ownSectionsOf(null, 'form')).toEqual({ own: [], foreign: [] });
        // Разделы бывшего единого прохода поделены: «возражения и цена» не
        // забирает закрытие, а «закрытие» — цену.
        const deal = {
            sections: [
                { section: 'OBJECTIONS' },
                { section: 'PRICE' },
                { section: 'CLOSING' },
                { section: 'REFUSAL' },
            ],
        };
        expect(ownSectionsOf(deal, 'movement')).toEqual({
            own: [{ section: 'OBJECTIONS' }, { section: 'PRICE' }],
            foreign: ['CLOSING', 'REFUSAL'],
        });
        expect(ownSectionsOf(deal, 'closing')).toEqual({
            own: [{ section: 'CLOSING' }, { section: 'REFUSAL' }],
            foreign: ['OBJECTIONS', 'PRICE'],
        });
    });

    it('итог: поля проходов рядом, синтез поверх, разделы — переданные', () => {
        const merged = mergeFocusResults({
            byKey: {
                form: FORM,
                content: CONTENT,
                movement: null,
                closing: { refusalReason: null },
            },
            synthesis: { score: 6, sentiment: 'positive' },
            sections: [{ section: 'GREETING' }],
            callType: 'cold',
            incompleteParts: ['movement'],
            usage: { tokens: 10 },
        });
        expect(merged).toEqual({
            sentiment: 'positive',
            needsFound: true,
            refusalReason: null,
            score: 6,
            sections: [{ section: 'GREETING' }],
            callType: 'cold',
            incompleteParts: ['movement'],
            usage: { tokens: 10 },
        });
    });
});
