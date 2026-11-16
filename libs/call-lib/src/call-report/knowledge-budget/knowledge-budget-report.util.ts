/**
 * Сводка «сколько знаков в каждом виде базы знаний, сколько помещается в
 * промпт и что обрезается» (этап 6.1). Собирается из той же таблицы
 * бюджетов, по которой материалы режет сам разбор.
 *
 * Чистые функции: без DI и чтения базы.
 */
import {
    KNOWLEDGE_USE_TITLES,
    complianceBudgetLines,
    focusBudgetLines,
    isPresentationContour,
    methodologyBudgetLines,
    type KnowledgeBudgetLine,
    type KnowledgeUse,
} from './knowledge-budgets';

/**
 * Знаков русского текста на один токен — оценка: точное число зависит от
 * модели, в сводке токены показываются со знаком «≈».
 */
export const KNOWLEDGE_CHARS_PER_TOKEN = 3;

/** Тип звонка портала в объёме сводки. */
export interface KnowledgeBudgetCallType {
    code: string;
    title: string;
    /** Вид с инструкцией этого типа звонка. */
    typedKind: string;
    /** У методики портала есть проход для этого типа. */
    methodology: boolean;
}

/** Сколько материалов вида лежит в базе портала (с общим слоем). */
export interface KnowledgeKindMeasure {
    kind: string;
    documents: number;
    chars: number;
}

/** Одно место чтения вида: бюджет и что в него поместилось. */
export interface KnowledgeBudgetUseReport {
    use: KnowledgeUse;
    title: string;
    budgetChars: number;
    /** Знаков, которые попадают в промпт. */
    fitChars: number;
    /** Знаков, которые не поместились в бюджет. */
    cutChars: number;
    /** Названия типов звонков, для которых читается; null — для всех типов. */
    callTypes: string[] | null;
}

export interface KnowledgeBudgetKindReport {
    kind: string;
    title: string;
    documents: number;
    chars: number;
    tokens: number;
    uses: KnowledgeBudgetUseReport[];
    /** Наибольшее число знаков, не попавших в промпт, среди мест чтения. */
    cutChars: number;
}

export const tokensOfChars = (chars: number): number =>
    Math.ceil(chars / KNOWLEDGE_CHARS_PER_TOKEN);

/** Все строки таблицы бюджетов для одного типа звонка портала. */
export function budgetLinesForType(
    type: KnowledgeBudgetCallType,
    knowledge: Readonly<Record<string, string>> | undefined,
): KnowledgeBudgetLine[] {
    const presentation = isPresentationContour(type.code);
    const focus = focusBudgetLines({ typedKind: type.typedKind, presentation });
    return [
        ...focus,
        ...(type.methodology
            ? methodologyBudgetLines(knowledge, { focus, presentation })
            : []),
        ...complianceBudgetLines(presentation),
    ];
}

/** Виды, которые читает конвейер портала, — в порядке первого появления. */
export function budgetKindsOf(
    types: readonly KnowledgeBudgetCallType[],
    knowledge: Readonly<Record<string, string>> | undefined,
): string[] {
    const kinds = new Set<string>();
    for (const type of types) {
        for (const item of budgetLinesForType(type, knowledge)) {
            kinds.add(item.kind);
        }
    }
    return [...kinds];
}

interface UseGroup {
    line: KnowledgeBudgetLine;
    types: string[];
}

/**
 * @param input.types типы звонков портала
 * @param input.knowledge виды, объявленные методикой портала; нет — методики нет
 * @param input.measures сколько материалов каждого вида лежит в базе
 * @param input.titleOf название вида для человека
 */
export function buildKnowledgeBudgetReport(input: {
    types: readonly KnowledgeBudgetCallType[];
    knowledge: Readonly<Record<string, string>> | undefined;
    measures: readonly KnowledgeKindMeasure[];
    titleOf: (kind: string) => string;
}): KnowledgeBudgetKindReport[] {
    // Вид → «место чтения + бюджет» → для каких типов звонков.
    const groups = new Map<string, Map<string, UseGroup>>();
    for (const type of input.types) {
        for (const item of budgetLinesForType(type, input.knowledge)) {
            const byUse = groups.get(item.kind) ?? new Map<string, UseGroup>();
            const key = `${item.use}:${item.budgetChars}`;
            const group = byUse.get(key) ?? { line: item, types: [] };
            group.types.push(type.title);
            byUse.set(key, group);
            groups.set(item.kind, byUse);
        }
    }
    const measureOf = new Map(input.measures.map(item => [item.kind, item]));

    return [...groups].map(([kind, byUse]) => {
        const measure = measureOf.get(kind);
        const chars = measure?.chars ?? 0;
        const uses = [...byUse.values()].map(group => {
            const fitChars = Math.min(chars, group.line.budgetChars);
            return {
                use: group.line.use,
                title: KNOWLEDGE_USE_TITLES[group.line.use],
                budgetChars: group.line.budgetChars,
                fitChars,
                cutChars: chars - fitChars,
                callTypes:
                    group.types.length === input.types.length
                        ? null
                        : group.types,
            };
        });
        return {
            kind,
            title: input.titleOf(kind),
            documents: measure?.documents ?? 0,
            chars,
            tokens: tokensOfChars(chars),
            uses,
            cutChars: Math.max(0, ...uses.map(use => use.cutChars)),
        };
    });
}
