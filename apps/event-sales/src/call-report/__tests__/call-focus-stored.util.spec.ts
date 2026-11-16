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

const PROMPT = 'focus-v3.1-2026-11-06';
const FORM = {
    sections: [{ section: 'GREETING', score: 7 }],
    sentiment: 'neutral',
};
const CONTENT = {
    sections: [{ section: 'NEEDS', score: 5 }],
    needsFound: true,
};

describe('call-focus-stored.util — сохранённые ответы проходов', () => {
    it('сохраняются только выжившие проходы; методика — со своей меткой', () => {
        const stored = buildStoredFocusPasses(
            { form: FORM, content: CONTENT, movement: null },
            { tag: 'polyansky@1.0.0', result: { checkpoints: [] } },
            PROMPT,
        );

        expect(stored).toEqual({
            promptVersion: PROMPT,
            passes: { form: FORM, content: CONTENT },
            methodology: {
                tag: 'polyansky@1.0.0',
                result: { checkpoints: [] },
            },
        });
        expect(storedFocusPassCount(stored)).toBe(3);
        expect(storedFocusPassCount(null)).toBe(0);
    });

    it('читаются из user_result; кривая форма, пустой набор и чужие ключи — мимо', () => {
        const stored = buildStoredFocusPasses(
            { form: FORM, content: null, movement: null },
            null,
            PROMPT,
        );
        const record = withFocusPasses({ callType: 'cold' }, stored);

        expect(parseStoredFocusPasses(record)).toEqual(stored);
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
            { form: FORM, content: null, movement: null },
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
            { form: FORM, content: null, movement: null },
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
        const byKey = { form: FORM, content: null, movement: {} };
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
                { form: FORM, content: CONTENT, movement: {} },
                { score: 6 },
                true,
                { checkpoints: [] },
            ),
        ).toEqual([]);
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
    });

    it('итог: поля проходов рядом, синтез поверх, разделы — переданные', () => {
        const merged = mergeFocusResults({
            byKey: { form: FORM, content: CONTENT, movement: null },
            synthesis: { score: 6, sentiment: 'positive' },
            sections: [{ section: 'GREETING' }],
            callType: 'cold',
            incompleteParts: ['movement'],
            usage: { tokens: 10 },
        });
        expect(merged).toEqual({
            sentiment: 'positive',
            needsFound: true,
            score: 6,
            sections: [{ section: 'GREETING' }],
            callType: 'cold',
            incompleteParts: ['movement'],
            usage: { tokens: 10 },
        });
    });
});
