import {
    asBoolean,
    asNumber,
    asRecord,
    asRecordArray,
    asString,
    asStringArray,
    asStringRecord,
} from './json-value.util';
import {
    AnalyticsCallLiteRow,
    AnalyticsLiteNextStep,
    AnalyticsLiteObjection,
    AnalyticsLiteSection,
} from '../types/analytics-lite.types';

/** Часть лёгкой строки, извлекаемая из user_result разбора (agent-analysis). */
export type AnalyticsLiteAnalysisPart = Pick<
    AnalyticsCallLiteRow,
    | 'analysisPresent'
    | 'score'
    | 'nextStep'
    | 'riskFlags'
    | 'coachingPriority'
    | 'sections'
    | 'objections'
    | 'versions'
>;

/** Разбора нет: null и пустые списки (каждой строке — свои экземпляры). */
function noAnalysis(): AnalyticsLiteAnalysisPart {
    return {
        analysisPresent: false,
        score: null,
        nextStep: null,
        riskFlags: [],
        coachingPriority: null,
        sections: [],
        objections: [],
        versions: null,
    };
}

/**
 * Проекция user_result глубокого разбора в поля лёгкой строки. Имена
 * полей — из AgentCallAnalysisDto (apps/event-sales, agent-gate); всё,
 * чего в разборе нет или что не того типа, → null / [] — без исключений.
 */
export function mapLiteAnalysis(
    analysis: Record<string, unknown> | null,
): AnalyticsLiteAnalysisPart {
    if (!analysis) return noAnalysis();
    return {
        analysisPresent: true,
        score: mapScore(analysis),
        nextStep: mapNextStep(analysis.nextStep),
        riskFlags: asStringArray(analysis.riskFlags),
        coachingPriority: asString(analysis.coachingPriority),
        sections: mapSections(analysis.sections),
        objections: mapObjections(analysis.objections),
        versions: asStringRecord(analysis.versions),
    };
}

/**
 * Единая шкала 0–100: weightedScore разбора; у старых разборов без него —
 * итоговая score (1–10) × 10, чтобы ряд не смешивал шкалы.
 */
function mapScore(analysis: Record<string, unknown>): number | null {
    const weighted = asNumber(analysis.weightedScore);
    if (weighted !== null) return weighted;
    const score = asNumber(analysis.score);
    return score !== null ? score * 10 : null;
}

function mapNextStep(value: unknown): AnalyticsLiteNextStep | null {
    const record = asRecord(value);
    if (!record) return null;
    return { set: asBoolean(record.set) ?? false, date: asString(record.date) };
}

/** Разделы без кода пропускаются; relevance не число → 0 (не применим). */
function mapSections(value: unknown): AnalyticsLiteSection[] {
    const sections: AnalyticsLiteSection[] = [];
    for (const item of asRecordArray(value)) {
        const section = asString(item.section);
        if (section === null) continue;
        sections.push({
            section,
            relevance: asNumber(item.relevance) ?? 0,
            score: asNumber(item.score),
            asWas: asString(item.asWas),
            alternatives: asStringArray(item.alternatives),
        });
    }
    return sections;
}

function mapObjections(value: unknown): AnalyticsLiteObjection[] {
    return asRecordArray(value).map(item => ({
        category: asString(item.category),
        quote: asString(item.quote),
        handled: asBoolean(item.handled),
        outcome: asString(item.outcome),
    }));
}
