import {
    FOCUS_SHARED_BUDGET_CHARS,
    budgetRequests,
    focusBudgetLines,
    methodologyBudgetLines,
    type KnowledgeBudgetLine,
    type KnowledgeMaterialBlock,
} from '@lib/call-lib';
import { KNOWLEDGE_KINDS } from '@lib/ai-rag';
import {
    fitSharedMaterials,
    focusContextFor,
    methodologyContextOf,
    renderFocusMaterials,
    synthesisContextOf,
} from '../services/call-focus-materials.util';

/** Блоки с материалами ровно на бюджет каждого вида — база заполнена до отказа. */
const fullBlocks = (
    lines: readonly KnowledgeBudgetLine[],
): KnowledgeMaterialBlock[] =>
    budgetRequests(lines).map(request => ({
        kind: request.kind,
        text: `[${request.kind}]`.padEnd(request.budgetChars, 'я'),
        chars: request.budgetChars,
        truncated: false,
    }));

/** Профиль типа звонка: по размеру как настоящий. */
const PROFILE = 'ЭТАП РАЗГОВОРА: Презентация\n'.padEnd(900, 'п');

describe('материалы разбора по проходам', () => {
    it('показ с базой, заполненной до бюджетов: общий слой не режется, хвост методологии презентации на месте', () => {
        const lines = focusBudgetLines({
            typedKind: 'call-analysis-presentation',
            presentation: true,
        });

        const { materials, sharedCutChars } = renderFocusMaterials({
            profileBlock: PROFILE,
            typedKind: 'call-analysis-presentation',
            presentation: true,
            lines,
            blocks: fullBlocks(lines),
            talkRatioMax: 60,
        });

        expect(sharedCutChars).toBe(0);
        expect(materials.shared).not.toContain('материалы усечены');
        expect(materials.shared.endsWith('я')).toBe(true);
        expect(materials.shared).toContain('[presentation-playbook]');
        expect(materials.talkRatioMax).toBe(60);
    });

    it('обычный звонок: методологии презентации в общем слое нет, узкие материалы — в своих проходах', () => {
        const lines = focusBudgetLines({
            typedKind: 'call-analysis-cold',
            presentation: false,
        });
        const { materials } = renderFocusMaterials({
            profileBlock: '',
            typedKind: 'call-analysis-cold',
            presentation: false,
            lines,
            blocks: fullBlocks(lines),
            talkRatioMax: null,
        });

        expect(materials.shared).toContain('[call-analysis-cold]');
        expect(materials.shared).not.toContain('МЕТОДОЛОГИЯ ПРЕЗЕНТАЦИИ');
        expect(focusContextFor(materials, 'form')).toBe(materials.shared);
        expect(focusContextFor(materials, 'content')).toContain(
            '[objection-playbook]',
        );
        // Оба прохода «движения сделки» читают один регламент отдела.
        expect(focusContextFor(materials, 'movement')).toContain(
            '[sales-regulation]',
        );
        expect(focusContextFor(materials, 'closing')).toBe(
            focusContextFor(materials, 'movement'),
        );
        expect(focusContextFor(materials, 'closing')).not.toContain(
            '[objection-playbook]',
        );
        expect(focusContextFor(materials, 'content')).not.toContain(
            '[sales-regulation]',
        );
        expect(synthesisContextOf(materials)).toContain('[call-etalon]');
        // Методики на портале нет — её проходу нечего добавлять.
        expect(materials.methodology).toBe('');
        expect(methodologyContextOf(materials)).toBe(materials.shared);
    });

    it('проход методики: объявленные методикой виды под своими заголовками', () => {
        const focus = focusBudgetLines({
            typedKind: 'call-analysis-cold',
            presentation: false,
        });
        const lines = [
            ...focus,
            ...methodologyBudgetLines(
                { 'product-facts': 'shared', 'own-kind': 'own' },
                { focus, presentation: false },
            ),
        ];
        const { materials } = renderFocusMaterials({
            profileBlock: '',
            typedKind: 'call-analysis-cold',
            presentation: false,
            lines,
            blocks: fullBlocks(lines),
            talkRatioMax: null,
        });

        const context = methodologyContextOf(materials);
        expect(context).toContain('ФАКТЫ О ПРОДУКТЕ, КОМПЛЕКТАХ И ЦЕНАХ');
        expect(context).toContain('[product-facts]');
        expect(context).toContain('МАТЕРИАЛЫ МЕТОДИКИ (own-kind):');
        // Остальным проходам факты о продукте не идут.
        expect(focusContextFor(materials, 'content')).not.toContain(
            '[product-facts]',
        );
    });

    it('тип со ссылкой на базовый вид: базовый блок в общем слое один раз', () => {
        const lines = focusBudgetLines({
            typedKind: 'call-analysis-base',
            presentation: false,
        });
        const { materials } = renderFocusMaterials({
            profileBlock: '',
            typedKind: 'call-analysis-base',
            presentation: false,
            lines,
            blocks: fullBlocks(lines),
            talkRatioMax: null,
        });

        expect(materials.shared.split('[call-analysis-base]')).toHaveLength(2);
    });

    it('признак скрипта: документ «Скрипт разговора» с текстом есть — true, нет или пустой — false', () => {
        const lines = focusBudgetLines({
            typedKind: 'call-analysis-cold',
            presentation: false,
        });
        const render = (blocks: KnowledgeMaterialBlock[]) =>
            renderFocusMaterials({
                profileBlock: '',
                typedKind: 'call-analysis-cold',
                presentation: false,
                lines,
                blocks,
                talkRatioMax: null,
            }).materials;

        const all = fullBlocks(lines);
        expect(
            all.some(block => block.kind === KNOWLEDGE_KINDS.salesScript),
        ).toBe(true);
        expect(render(all).scriptIncluded).toBe(true);

        const withoutScript = all.filter(
            block => block.kind !== KNOWLEDGE_KINDS.salesScript,
        );
        expect(render(withoutScript).scriptIncluded).toBe(false);

        const emptyScript = all.map(block =>
            block.kind === KNOWLEDGE_KINDS.salesScript
                ? { ...block, text: '', chars: 0 }
                : block,
        );
        expect(render(emptyScript).scriptIncluded).toBe(false);
    });

    it('страховка потолка: слой длиннее потолка режется с пометкой и числом обрезанных знаков', () => {
        const fitted = fitSharedMaterials(
            'т'.repeat(FOCUS_SHARED_BUDGET_CHARS + 350),
        );

        expect(fitted.cutChars).toBe(350);
        expect(fitted.text).toContain('материалы усечены по размеру контекста');
        expect(fitSharedMaterials('короткий')).toEqual({
            text: 'короткий',
            cutChars: 0,
        });
    });
});
