import {
    METHODOLOGY_KNOWLEDGE_KINDS,
    focusBudgetLines,
    methodologyBudgetLines,
} from '../knowledge-budget/knowledge-budgets';
import { buildMethodologyCatalog } from '../methodology/methodology-catalog.const';
import { POLYANSKY_METHODOLOGY } from '../methodology/polyansky.methodology';

describe('каталог формы методики: материалы базы знаний', () => {
    it('виды для прохода методики отдаются с русскими названиями и бюджетами', () => {
        const kinds = buildMethodologyCatalog().knowledgeKinds;

        expect(kinds).toEqual([
            {
                kind: 'product-facts',
                title: 'Факты о продукте, комплектах и ценах',
                budgetChars: 6000,
                presentationOnly: false,
            },
            {
                kind: 'objection-playbook',
                title: 'Плейбук отработки возражений',
                budgetChars: 3000,
                presentationOnly: false,
            },
            {
                kind: 'sales-regulation',
                title: 'Регламент отдела продаж',
                budgetChars: 3000,
                presentationOnly: false,
            },
            {
                kind: 'presentation-playbook',
                title: 'Методология презентации (хвост и 5К)',
                budgetChars: 6000,
                presentationOnly: true,
            },
        ]);
    });

    it('бюджеты каталога — те же числа, по которым проход методики режет материалы', () => {
        const focus = focusBudgetLines({
            typedKind: 'call-analysis-cold',
            presentation: false,
        });
        const lines = methodologyBudgetLines(
            Object.fromEntries(
                METHODOLOGY_KNOWLEDGE_KINDS.map(item => [item.kind, 'shared']),
            ),
            { focus, presentation: false },
        );

        for (const line of lines) {
            expect(
                METHODOLOGY_KNOWLEDGE_KINDS.find(
                    item => item.kind === line.kind,
                )?.budgetChars,
            ).toBe(line.budgetChars);
        }
    });

    it('встроенная методика объявляет только виды из каталога', () => {
        const known = METHODOLOGY_KNOWLEDGE_KINDS.map(item => item.kind);

        for (const kind of Object.keys(POLYANSKY_METHODOLOGY.knowledge ?? {})) {
            expect(known).toContain(kind);
        }
    });
});
