import {
    FOCUS_SHARED_BUDGET_CHARS,
    FOCUS_SHARED_MATERIALS_CHARS,
    KNOWLEDGE_USES,
    KNOWLEDGE_USE_TITLES,
    budgetRequests,
    complianceBudgetLines,
    focusBudgetLines,
    isPresentationContour,
    methodologyBudgetLines,
    type KnowledgeBudgetLine,
} from '../knowledge-budgets';

const budgetOf = (
    lines: readonly KnowledgeBudgetLine[],
    kind: string,
): number | undefined => lines.find(item => item.kind === kind)?.budgetChars;

const sharedSum = (lines: readonly KnowledgeBudgetLine[]): number =>
    lines
        .filter(item => item.use === KNOWLEDGE_USES.focusShared)
        .reduce((sum, item) => sum + item.budgetChars, 0);

/** Виды, объявленные методикой Полянского. */
const KNOWLEDGE = {
    'product-facts': 'shared',
    'presentation-playbook': 'polyansky',
    'objection-playbook': 'polyansky',
    'sales-regulation': 'polyansky',
};

describe('таблица бюджетов базы знаний', () => {
    it('презентационный контур — показ, звонок по решению и доработка', () => {
        expect(isPresentationContour('presentation')).toBe(true);
        expect(isPresentationContour('decision')).toBe(true);
        expect(isPresentationContour('refine')).toBe(true);
        expect(isPresentationContour('cold')).toBe(false);
        expect(isPresentationContour(null)).toBe(false);
    });

    it('обычный звонок: методология презентации не читается, у каждого вида своё место', () => {
        const lines = focusBudgetLines({
            typedKind: 'call-analysis-cold',
            presentation: false,
        });

        expect(budgetOf(lines, 'presentation-playbook')).toBeUndefined();
        expect(budgetOf(lines, 'sales-script')).toBe(6000);
        expect(budgetOf(lines, 'call-analysis-cold')).toBe(6000);
        expect(
            lines.find(item => item.kind === 'objection-playbook')?.use,
        ).toBe(KNOWLEDGE_USES.focusContent);
        expect(lines.find(item => item.kind === 'sales-regulation')?.use).toBe(
            KNOWLEDGE_USES.focusMovement,
        );
        expect(lines.find(item => item.kind === 'call-etalon')?.use).toBe(
            KNOWLEDGE_USES.focusSynthesis,
        );
    });

    it('показ: общий слой помещается в потолок с запасом на заголовки и профиль типа', () => {
        const lines = focusBudgetLines({
            typedKind: 'call-analysis-presentation',
            presentation: true,
        });

        expect(budgetOf(lines, 'presentation-playbook')).toBe(6000);
        expect(sharedSum(lines)).toBe(FOCUS_SHARED_MATERIALS_CHARS);
        expect(FOCUS_SHARED_BUDGET_CHARS).toBeGreaterThan(sharedSum(lines));
    });

    it('тип со ссылкой на базовый вид: базовый вид в таблице один раз', () => {
        const lines = focusBudgetLines({
            typedKind: 'call-analysis-base',
            presentation: false,
        });

        expect(
            lines.filter(item => item.kind === 'call-analysis-base'),
        ).toHaveLength(1);
    });

    it('проход методики: объявленные виды, кроме тех, что уже в общем слое', () => {
        const cold = focusBudgetLines({
            typedKind: 'call-analysis-cold',
            presentation: false,
        });
        const forCold = methodologyBudgetLines(KNOWLEDGE, {
            focus: cold,
            presentation: false,
        });
        // Методология презентации вне презентационного контура не нужна.
        expect(forCold.map(item => item.kind)).toEqual([
            'product-facts',
            'objection-playbook',
            'sales-regulation',
        ]);
        expect(budgetOf(forCold, 'product-facts')).toBe(6000);
        expect(
            forCold.every(item => item.use === KNOWLEDGE_USES.methodology),
        ).toBe(true);

        const show = focusBudgetLines({
            typedKind: 'call-analysis-presentation',
            presentation: true,
        });
        // У показа методология презентации уже идёт во все проходы.
        expect(
            methodologyBudgetLines(KNOWLEDGE, {
                focus: show,
                presentation: true,
            }).map(item => item.kind),
        ).toEqual(['product-facts', 'objection-playbook', 'sales-regulation']);
    });

    it('методика без своих материалов — прохода ничего не добавляется; незнакомый вид получает бюджет по умолчанию', () => {
        const focus = focusBudgetLines({
            typedKind: 'call-analysis-cold',
            presentation: false,
        });

        expect(
            methodologyBudgetLines(undefined, { focus, presentation: false }),
        ).toEqual([]);
        expect(
            methodologyBudgetLines(
                { 'own-kind': 'own' },
                { focus, presentation: false },
            ),
        ).toEqual([
            {
                kind: 'own-kind',
                use: KNOWLEDGE_USES.methodology,
                budgetChars: 3000,
            },
        ]);
    });

    it('проверка по регламенту: свои бюджеты регламента и базового вида, методология — только у показа', () => {
        const plain = complianceBudgetLines(false);
        expect(budgetOf(plain, 'sales-regulation')).toBe(5000);
        expect(budgetOf(plain, 'call-analysis-base')).toBe(3000);
        expect(budgetOf(plain, 'product-facts')).toBe(6000);
        expect(budgetOf(plain, 'presentation-playbook')).toBeUndefined();

        expect(
            budgetOf(complianceBudgetLines(true), 'presentation-playbook'),
        ).toBe(6000);
    });

    it('запросы к базе: один на вид, бюджет — наибольший из мест чтения', () => {
        const requests = budgetRequests([
            {
                kind: 'sales-regulation',
                use: KNOWLEDGE_USES.focusMovement,
                budgetChars: 3000,
            },
            {
                kind: 'sales-regulation',
                use: KNOWLEDGE_USES.compliance,
                budgetChars: 5000,
            },
            {
                kind: 'sales-script',
                use: KNOWLEDGE_USES.focusShared,
                budgetChars: 6000,
            },
        ]);

        expect(requests).toEqual([
            { kind: 'sales-regulation', budgetChars: 5000 },
            { kind: 'sales-script', budgetChars: 6000 },
        ]);
    });
});

describe('подписи мест чтения материалов', () => {
    it('место «focus-movement» подписано обоими проходами «движения сделки»: возражения и цена, закрытие', () => {
        expect(KNOWLEDGE_USE_TITLES[KNOWLEDGE_USES.focusMovement]).toBe(
            'Разбор звонка: проходы «Возражения и цена» и «Закрытие»',
        );
    });
});
