/**
 * Бюджеты материалов базы знаний в промптах разбора звонка — ОДНА таблица
 * для разбора, прохода методики, проверки по регламенту и сводки в админке
 * «сколько знаков в каждом виде и что обрезано» (этап 6.1).
 *
 * Раньше числа были записаны в двух сервисах и расходились с тем, что
 * показывала админка. Чистые функции: без DI и чтения базы.
 */
import { KNOWLEDGE_KINDS } from '@lib/ai-rag';
import type { KnowledgeMaterialRequest } from '../services/knowledge-materials.service';

/** Где в конвейере читается вид материалов. */
export const KNOWLEDGE_USES = {
    /** Общий слой: все проходы разбора и итог. */
    focusShared: 'focus-shared',
    focusContent: 'focus-content',
    focusMovement: 'focus-movement',
    focusSynthesis: 'focus-synthesis',
    methodology: 'methodology',
    compliance: 'compliance',
} as const;

export type KnowledgeUse = (typeof KNOWLEDGE_USES)[keyof typeof KNOWLEDGE_USES];

export const KNOWLEDGE_USE_TITLES: Record<KnowledgeUse, string> = {
    'focus-shared': 'Разбор звонка: все проходы и итог',
    'focus-content': 'Разбор звонка: проход «Содержание продажи»',
    'focus-movement': 'Разбор звонка: проход «Движение сделки»',
    'focus-synthesis': 'Разбор звонка: итоговая оценка',
    methodology: 'Разбор звонка: проход методики',
    compliance: 'Проверка по регламенту',
};

/** Одна строка таблицы: вид материалов, где читается и сколько знаков берём. */
export interface KnowledgeBudgetLine {
    kind: string;
    use: KnowledgeUse;
    budgetChars: number;
}

/** Бюджет вида в разборе и проходе методики, знаков. */
const FOCUS_BUDGET_CHARS: Readonly<Record<string, number>> = {
    [KNOWLEDGE_KINDS.salesScript]: 6000,
    [KNOWLEDGE_KINDS.callAnalysisBase]: 4000,
    [KNOWLEDGE_KINDS.general]: 2000,
    [KNOWLEDGE_KINDS.presentationPlaybook]: 6000,
    [KNOWLEDGE_KINDS.objectionPlaybook]: 3000,
    [KNOWLEDGE_KINDS.salesRegulation]: 3000,
    [KNOWLEDGE_KINDS.callEtalon]: 3000,
    [KNOWLEDGE_KINDS.productFacts]: 6000,
};

/** Инструкция типа звонка (`call-analysis-<тип>` или вид из профиля типа). */
const TYPED_KIND_BUDGET_CHARS = 6000;

/** Вид вне таблицы, объявленный методикой портала. */
const OTHER_KIND_BUDGET_CHARS = 3000;

/** Сумма бюджетов видов общего слоя — больше материалов в нём не бывает. */
export const FOCUS_SHARED_MATERIALS_CHARS = 24000;

/**
 * Запас общего слоя на заголовки блоков и профиль типа звонка. Без запаса
 * потолок равнялся сумме бюджетов, и у показов с полностью заполненной базой
 * обрезался хвост последнего блока — методологии презентации.
 */
export const FOCUS_SHARED_OVERHEAD_CHARS = 2000;

/** Потолок общего слоя в одном проходе разбора, знаков. */
export const FOCUS_SHARED_BUDGET_CHARS =
    FOCUS_SHARED_MATERIALS_CHARS + FOCUS_SHARED_OVERHEAD_CHARS;

/** Типы презентационного контура: показ, звонок по решению и доработка. */
const PRESENTATION_CONTOUR: readonly string[] = [
    'presentation',
    'decision',
    'refine',
];

/**
 * Презентационный контур: в доработке и звонке по решению добивают то, что
 * не закрыли на показе, поэтому методология презентации нужна и им.
 */
export function isPresentationContour(callType: string | null): boolean {
    return callType !== null && PRESENTATION_CONTOUR.includes(callType);
}

const line = (
    kind: string,
    use: KnowledgeUse,
    budgetChars: number = FOCUS_BUDGET_CHARS[kind] ?? OTHER_KIND_BUDGET_CHARS,
): KnowledgeBudgetLine => ({ kind, use, budgetChars });

/**
 * Материалы основного разбора одного звонка.
 * @param input.typedKind вид с инструкцией типа звонка
 * @param input.presentation звонок презентационного контура
 */
export function focusBudgetLines(input: {
    typedKind: string;
    presentation: boolean;
}): KnowledgeBudgetLine[] {
    const lines = [
        line(KNOWLEDGE_KINDS.salesScript, KNOWLEDGE_USES.focusShared),
        line(KNOWLEDGE_KINDS.callAnalysisBase, KNOWLEDGE_USES.focusShared),
        line(KNOWLEDGE_KINDS.general, KNOWLEDGE_USES.focusShared),
    ];
    // Устаревший базовый вид может быть назначен типу инструкцией — второй
    // раз его не читаем.
    if (input.typedKind !== KNOWLEDGE_KINDS.callAnalysisBase) {
        lines.push(
            line(
                input.typedKind,
                KNOWLEDGE_USES.focusShared,
                TYPED_KIND_BUDGET_CHARS,
            ),
        );
    }
    if (input.presentation) {
        lines.push(
            line(
                KNOWLEDGE_KINDS.presentationPlaybook,
                KNOWLEDGE_USES.focusShared,
            ),
        );
    }
    lines.push(
        line(KNOWLEDGE_KINDS.objectionPlaybook, KNOWLEDGE_USES.focusContent),
        line(KNOWLEDGE_KINDS.salesRegulation, KNOWLEDGE_USES.focusMovement),
        line(KNOWLEDGE_KINDS.callEtalon, KNOWLEDGE_USES.focusSynthesis),
    );
    return lines;
}

/**
 * Материалы прохода методики: виды, которые методика объявила в `knowledge`
 * и которых нет в общем слое этого звонка (общий слой проход получает и так).
 * Методология презентации вне презентационного контура не читается.
 */
export function methodologyBudgetLines(
    knowledge: Readonly<Record<string, string>> | undefined,
    input: { focus: readonly KnowledgeBudgetLine[]; presentation: boolean },
): KnowledgeBudgetLine[] {
    if (!knowledge) return [];
    const shared = new Set(
        input.focus
            .filter(item => item.use === KNOWLEDGE_USES.focusShared)
            .map(item => item.kind),
    );
    return Object.keys(knowledge)
        .filter(kind => !shared.has(kind))
        .filter(
            kind =>
                input.presentation ||
                kind !== KNOWLEDGE_KINDS.presentationPlaybook,
        )
        .map(kind => line(kind, KNOWLEDGE_USES.methodology));
}

/** Материалы проверки по регламенту (норма и факты). */
export function complianceBudgetLines(
    presentation: boolean,
): KnowledgeBudgetLine[] {
    const use = KNOWLEDGE_USES.compliance;
    const lines = [
        line(KNOWLEDGE_KINDS.salesScript, use),
        line(KNOWLEDGE_KINDS.callAnalysisBase, use, 3000),
        line(KNOWLEDGE_KINDS.salesRegulation, use, 5000),
        line(KNOWLEDGE_KINDS.productFacts, use),
        line(KNOWLEDGE_KINDS.objectionPlaybook, use),
    ];
    if (presentation) {
        lines.push(line(KNOWLEDGE_KINDS.presentationPlaybook, use));
    }
    return lines;
}

/**
 * Запросы к базе знаний по строкам таблицы: один запрос на вид. Вид, нужный
 * в двух местах, читается один раз с наибольшим из бюджетов.
 */
export function budgetRequests(
    lines: readonly KnowledgeBudgetLine[],
): KnowledgeMaterialRequest[] {
    const byKind = new Map<string, number>();
    for (const item of lines) {
        byKind.set(
            item.kind,
            Math.max(byKind.get(item.kind) ?? 0, item.budgetChars),
        );
    }
    return [...byKind].map(([kind, budgetChars]) => ({ kind, budgetChars }));
}
