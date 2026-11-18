import {
    emptyFocusResults,
    mergeFocusResults,
    needsFromItems,
} from '../services/call-focus-assemble.util';

/**
 * Потребности задания с цитатами (focus-v3.4): модель отдаёт needItems, а
 * список needs (его читают карточка, отчёты и методика) собирает код.
 */
describe('needsFromItems — список потребностей из needItems', () => {
    it('потребности по порядку, без пустых и с обрезанными пробелами', () => {
        expect(
            needsFromItems({
                needItems: [
                    { need: 'Следить за НДС', quote: 'по НДС', startSec: 12 },
                    { need: '  ', quote: null, startSec: null },
                    {
                        need: ' Шаблоны договоров ',
                        quote: null,
                        startSec: null,
                    },
                    null,
                    'строка вместо записи',
                ],
            }),
        ).toEqual({ needs: ['Следить за НДС', 'Шаблоны договоров'] });
    });

    it('прежнее задание (needs есть) — не трогает', () => {
        expect(
            needsFromItems({ needs: ['а'], needItems: [{ need: 'б' }] }),
        ).toEqual({});
    });

    it('needItems нет — ничего не добавляет', () => {
        expect(needsFromItems({ needsFound: false })).toEqual({});
    });

    it('сборка разбора кладёт needs рядом с needItems', () => {
        const byKey = emptyFocusResults();
        byKey.content = {
            needsFound: true,
            needItems: [
                { need: 'Кадровые приказы', quote: null, startSec: 40 },
            ],
        };
        const merged = mergeFocusResults({
            byKey,
            synthesis: null,
            sections: [],
            callType: 'presentation',
            incompleteParts: [],
            usage: undefined,
        });
        expect(merged.needs).toEqual(['Кадровые приказы']);
        expect(merged.needItems).toEqual(byKey.content.needItems);
    });
});
