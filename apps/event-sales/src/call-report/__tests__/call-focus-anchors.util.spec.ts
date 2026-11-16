import {
    POLYANSKY_METHODOLOGY,
    type Methodology,
    type ResolvedMethodology,
} from '@lib/call-lib';
import { renderMethodologyAnchorsBlock } from '../services/call-focus-anchors.util';

const resolvedOf = (
    fields: Partial<Methodology> = {},
): ResolvedMethodology => ({
    methodology: { ...POLYANSKY_METHODOLOGY, ...fields },
    scope: 'common',
    source: 'builtin',
    versionTag: 'polyansky@1.0.0',
});

describe('якоря шкалы методики в промпте оценки', () => {
    it('якорей нет — блока нет: разбор идёт как раньше', () => {
        expect(renderMethodologyAnchorsBlock(null)).toBe('');
        expect(renderMethodologyAnchorsBlock(resolvedOf())).toBe('');
        expect(
            renderMethodologyAnchorsBlock(resolvedOf({ sectionAnchors: {} })),
        ).toBe('');
        // Раздел объявлен, но полосы пусты.
        expect(
            renderMethodologyAnchorsBlock(
                resolvedOf({ sectionAnchors: { NEEDS: {} } }),
            ),
        ).toBe('');
    });

    it('разделы идут в порядке ядра, полосы — от низкой к высокой, названия по-русски', () => {
        const block = renderMethodologyAnchorsBlock(
            resolvedOf({
                title: 'Полянский',
                sectionAnchors: {
                    PRESENTATION: {
                        '9-10': 'каждый блок по спирали',
                        '1-2': 'показа не было',
                    },
                    NEEDS: { '5-6': 'потребности названы, но не уточнены' },
                },
            }),
        );

        expect(block).toContain('ЯКОРЯ ШКАЛЫ ПО МЕТОДИКЕ «Полянский»');
        expect(block).toContain(
            'Выявление потребностей:\n  5-6 — потребности названы, но не уточнены',
        );
        expect(block).toContain(
            'Презентация под потребности:\n  1-2 — показа не было\n  9-10 — каждый блок по спирали',
        );
        expect(block.indexOf('Выявление потребностей')).toBeLessThan(
            block.indexOf('Презентация под потребности'),
        );
        // Кодов разделов в тексте для модели нет.
        expect(block).not.toContain('PRESENTATION');
        expect(block).not.toContain('NEEDS');
    });
});
