import type { AiScoringCapRule } from '../settings/ai-settings.types';
import { AnalysisSection } from './sections.util';

/**
 * Потолки оценок и стоп-фразы (план §4.3, Фаза 2).
 *
 * Правила — решения людей: они приходят настройкой портала
 * `ai_analytics_scoring` (парсер `settings/ai-settings.parse.model.ts`,
 * тип `AiScoringCapRule`) и применяются кодом **после** разбора, а не
 * промптом внутри него: LLM оценивает разговор, а РОП решает, что «нет даты
 * следующего шага» не даёт закрытию больше пяти баллов.
 *
 * Два разных механизма:
 * - **потолок** режет балл раздела и ставит флаг разбора;
 * - **стоп-фраза** только возвращается списком и балл НЕ меняет — иначе одно
 *   слово превращалось бы в наказание без разбора смысла.
 */

/** Значение факта разбора, по которому проверяется условие правила. */
export type ScoringFactValue = boolean | number | string | null;

/** Факты разбора: код факта → значение (`nextStep.set`, `durationSec`, …). */
export type ScoringFacts = Readonly<Record<string, ScoringFactValue>>;

/** Операторы условия правила; `=` и `==` синонимы. */
export const SCORING_CAP_OPERATORS = [
    '>=',
    '<=',
    '!=',
    '==',
    '=',
    '>',
    '<',
] as const;
export type ScoringCapOperator = (typeof SCORING_CAP_OPERATORS)[number];

/** Разобранное условие вида «nextStep.set = false». */
export interface ScoringCapCondition {
    fact: string;
    operator: ScoringCapOperator;
    value: ScoringFactValue;
}

/** Сработавшее правило потолка. */
export interface ScoringCapApplied {
    ruleCode: string;
    section: string;
    flag: string;
    maxScore: number;
    scoreBefore: number;
    scoreAfter: number;
    /** true — балл действительно срезан; false — он и так был не выше. */
    cut: boolean;
}

/** Почему правило не применилось. */
export const SCORING_CAP_SKIP_REASONS = {
    badCondition: 'bad-condition',
    unknownFact: 'unknown-fact',
    noSection: 'no-section',
} as const;
export type ScoringCapSkipReason =
    (typeof SCORING_CAP_SKIP_REASONS)[keyof typeof SCORING_CAP_SKIP_REASONS];

export interface ScoringCapSkipped {
    ruleCode: string;
    reason: ScoringCapSkipReason;
}

export interface ScoringCapsResult {
    /** Копия разделов с применёнными потолками (вход не мутируется). */
    sections: AnalysisSection[];
    /** Флаги разбора в порядке правил, без повторов. */
    flags: string[];
    applied: ScoringCapApplied[];
    skipped: ScoringCapSkipped[];
}

const QUOTED = /^'(.*)'$|^"(.*)"$/;

/** Литерал условия: true/false/null, число или строка (кавычки не нужны). */
function parseLiteral(raw: string): ScoringFactValue {
    const text = raw.trim();
    const quoted = QUOTED.exec(text);
    if (quoted) {
        return quoted[1] ?? quoted[2] ?? '';
    }
    if (text === 'true' || text === 'false') {
        return text === 'true';
    }
    if (text === 'null') {
        return null;
    }
    const numeric = Number(text.replace(',', '.'));
    return text !== '' && Number.isFinite(numeric) ? numeric : text;
}

/**
 * Условие правила: «факт оператор значение» либо одиночный факт (что
 * равносильно «факт = true»). Всё остальное — `bad-condition`.
 */
export function parseCapCondition(
    condition: string,
): ScoringCapCondition | null {
    const text = (condition ?? '').trim();
    if (text === '') {
        return null;
    }
    for (const operator of SCORING_CAP_OPERATORS) {
        const at = text.indexOf(operator);
        if (at <= 0) {
            continue;
        }
        const fact = text.slice(0, at).trim();
        const value = parseLiteral(text.slice(at + operator.length));
        return fact === '' ? null : { fact, operator, value };
    }
    return /\s/.test(text) ? null : { fact: text, operator: '=', value: true };
}

const sameValue = (a: ScoringFactValue, b: ScoringFactValue): boolean =>
    typeof a === 'string' && typeof b === 'string'
        ? a.trim().toLowerCase() === b.trim().toLowerCase()
        : a === b;

/** Сравнение факта с литералом; порядковые операторы — только для чисел. */
export function matchesCondition(
    condition: ScoringCapCondition,
    facts: ScoringFacts,
): boolean {
    const actual = facts[condition.fact];
    if (actual === undefined) {
        return false;
    }
    const expected = condition.value;
    if (condition.operator === '=' || condition.operator === '==') {
        return sameValue(actual, expected);
    }
    if (condition.operator === '!=') {
        return !sameValue(actual, expected);
    }
    if (typeof actual !== 'number' || typeof expected !== 'number') {
        return false;
    }
    if (condition.operator === '>') {
        return actual > expected;
    }
    if (condition.operator === '>=') {
        return actual >= expected;
    }
    if (condition.operator === '<') {
        return actual < expected;
    }
    return actual <= expected;
}

function capSection(
    rule: AiScoringCapRule,
    section: AnalysisSection,
): { section: AnalysisSection; applied: ScoringCapApplied } | null {
    if (section.score === null || !(section.relevance > 0)) {
        return null;
    }
    const cut = section.score > rule.maxScore;
    return {
        section: cut ? { ...section, score: rule.maxScore } : section,
        applied: {
            ruleCode: rule.ruleCode,
            section: rule.section,
            flag: rule.flag,
            maxScore: rule.maxScore,
            scoreBefore: section.score,
            scoreAfter: cut ? rule.maxScore : section.score,
            cut,
        },
    };
}

/**
 * Применение потолков к разделам разбора: правило срабатывает, когда его
 * условие истинно на фактах звонка; тогда балл раздела опускается до
 * `maxScore` и выставляется флаг. Если факта нет или раздела в разборе нет
 * (нет оценки либо relevance = 0), правило не применяется — причина
 * попадает в `skipped`, а балл остаётся как был.
 */
export function applyScoringCaps(
    sections: readonly AnalysisSection[],
    rules: readonly AiScoringCapRule[],
    facts: ScoringFacts,
): ScoringCapsResult {
    let current: AnalysisSection[] = sections.map(section => ({ ...section }));
    const flags: string[] = [];
    const applied: ScoringCapApplied[] = [];
    const skipped: ScoringCapSkipped[] = [];
    for (const rule of rules) {
        const condition = parseCapCondition(rule.condition);
        if (condition === null) {
            skipped.push({
                ruleCode: rule.ruleCode,
                reason: SCORING_CAP_SKIP_REASONS.badCondition,
            });
            continue;
        }
        if (facts[condition.fact] === undefined) {
            skipped.push({
                ruleCode: rule.ruleCode,
                reason: SCORING_CAP_SKIP_REASONS.unknownFact,
            });
            continue;
        }
        if (!matchesCondition(condition, facts)) {
            continue;
        }
        const index = current.findIndex(item => item.section === rule.section);
        const capped = index === -1 ? null : capSection(rule, current[index]);
        if (capped === null) {
            skipped.push({
                ruleCode: rule.ruleCode,
                reason: SCORING_CAP_SKIP_REASONS.noSection,
            });
            continue;
        }
        current = current.map((item, at) =>
            at === index ? capped.section : item,
        );
        applied.push(capped.applied);
        if (!flags.includes(rule.flag)) {
            flags.push(rule.flag);
        }
    }
    return { sections: current, flags, applied, skipped };
}

/** Нормализация текста для поиска стоп-фраз: регистр, ё и пробелы. */
const normalizeText = (text: string): string =>
    text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

/**
 * Найденные стоп-фразы в тексте — списком, в порядке справочника и без
 * повторов. Балл разбора стоп-фраза НЕ меняет: это материал для разговора
 * РОПа с менеджером, а не автоматическое наказание.
 */
export function findStopWords(
    text: string | null | undefined,
    stopWords: readonly string[],
): string[] {
    const haystack = normalizeText(text ?? '');
    if (haystack === '') {
        return [];
    }
    const found: string[] = [];
    for (const word of stopWords) {
        const needle = normalizeText(word);
        if (
            needle !== '' &&
            !found.includes(word) &&
            haystack.includes(needle)
        ) {
            found.push(word);
        }
    }
    return found;
}

/** Те же стоп-фразы по репликам разделов разбора (`asWas`). */
export function findStopWordsInSections(
    sections: readonly AnalysisSection[],
    stopWords: readonly string[],
): string[] {
    const text = sections.map(section => section.asWas ?? '').join(' ');
    return findStopWords(text, stopWords);
}
