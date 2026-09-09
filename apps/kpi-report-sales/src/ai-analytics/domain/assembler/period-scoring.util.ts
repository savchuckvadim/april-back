/**
 * Потолки оценивания и стоп-фразы периода (план §4.3, поток 14b): правила
 * ключа `ai_analytics_scoring` применяются к разборам ПОСЛЕ выборки и до
 * сборки матрицы — оценивает разговор LLM, а решает, что «нет даты
 * следующего шага» не даёт закрытию больше пяти баллов, руководитель.
 *
 * Балл режет только потолок; стоп-фраза балл НЕ меняет и возвращается
 * списком — это материал для разговора, а не автоматическое наказание.
 * Текста транскрипта в lite-выборке нет, поэтому стоп-фразы ищутся в
 * цитатах разбора: `sections[].asWas` и `objections[].quote`.
 *
 * Чистые детерминированные функции: вход не мутируется.
 */
import {
    applyScoringCaps,
    findStopWords,
    type AiScoringSettings,
    type ScoringCapSkipped,
    type ScoringFacts,
} from '@lib/sales-ai-analytics';
import type { DatedLiteRow } from '../loaders/lite-row.mapper';
import type { ManagerScoringFlag } from './manager-snapshot.types';

/** След правил по одному менеджеру за период. */
export interface ManagerScoringTrace {
    caps: ManagerScoringFlag[];
    flags: string[];
    stopWords: string[];
}

export interface PeriodScoringResult {
    /** Строки с применёнными потолками (в том же порядке). */
    rows: DatedLiteRow[];
    /** След правил по менеджеру (ключ — managerId строкой). */
    byManager: Map<string, ManagerScoringTrace>;
    /** Правила, не применившиеся ни к одному разбору, с причиной. */
    skipped: ScoringCapSkipped[];
}

/**
 * Факты разбора, по которым проверяются условия правил. Имена — те же,
 * что РОП пишет в условии правила («nextStep.date = null»).
 */
export function scoringFactsOf(row: DatedLiteRow): ScoringFacts {
    return {
        'nextStep.set': row.nextStep?.set ?? false,
        'nextStep.date': row.nextStep?.date ?? null,
        durationSec: row.durationSec,
        callType: row.callType,
        score: row.score,
        analysisPresent: row.analysisPresent,
        'riskFlags.count': row.riskFlags.length,
        'objections.count': row.objections.length,
    };
}

/** Цитаты разбора, в которых ищутся стоп-фразы. */
export function quotesOf(row: DatedLiteRow): string {
    return [
        ...row.sections.map(section => section.asWas ?? ''),
        ...row.objections.map(objection => objection.quote ?? ''),
    ]
        .filter(text => text !== '')
        .join(' \n ');
}

const emptyTrace = (): ManagerScoringTrace => ({
    caps: [],
    flags: [],
    stopWords: [],
});

/** Счётчик правила в следе менеджера (создаётся при первом срабатывании). */
function capOf(
    trace: ManagerScoringTrace,
    applied: {
        ruleCode: string;
        section: string;
        flag: string;
        maxScore: number;
    },
): ManagerScoringFlag {
    const found = trace.caps.find(cap => cap.ruleCode === applied.ruleCode);
    if (found) return found;
    const created: ManagerScoringFlag = {
        ruleCode: applied.ruleCode,
        section: applied.section,
        flag: applied.flag,
        maxScore: applied.maxScore,
        calls: 0,
        cut: 0,
    };
    trace.caps.push(created);
    return created;
}

const pushUnique = (list: string[], value: string): void => {
    if (!list.includes(value)) list.push(value);
};

/**
 * Применение правил портала к строкам периода: потолки режут баллы
 * разделов и выставляют флаги, стоп-фразы собираются списком. Правило без
 * факта или без раздела в разборе не применяется — его причина попадает в
 * `skipped` (без повторов), а балл остаётся как был.
 */
export function applyPeriodScoring(
    rows: readonly DatedLiteRow[],
    scoring: AiScoringSettings,
): PeriodScoringResult {
    const byManager = new Map<string, ManagerScoringTrace>();
    const skipped: ScoringCapSkipped[] = [];
    const capped = rows.map(row => {
        const result = applyScoringCaps(
            row.sections,
            scoring.caps,
            scoringFactsOf(row),
        );
        for (const item of result.skipped) {
            if (!skipped.some(known => known.ruleCode === item.ruleCode)) {
                skipped.push(item);
            }
        }
        if (row.managerId === null) return row;
        const trace = byManager.get(row.managerId) ?? emptyTrace();
        byManager.set(row.managerId, trace);
        for (const applied of result.applied) {
            const cap = capOf(trace, applied);
            cap.calls += 1;
            if (applied.cut) cap.cut += 1;
        }
        for (const flag of result.flags) pushUnique(trace.flags, flag);
        for (const word of findStopWords(quotesOf(row), scoring.stopWords)) {
            pushUnique(trace.stopWords, word);
        }
        return { ...row, sections: result.sections };
    });
    return { rows: capped, byManager, skipped };
}

/** След менеджера или пустой (менеджера правила не задели). */
export function traceOf(
    result: PeriodScoringResult,
    managerId: string,
): ManagerScoringTrace {
    return result.byManager.get(managerId) ?? emptyTrace();
}
