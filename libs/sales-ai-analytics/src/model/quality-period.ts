import {
    CALL_REPORT_SECTION_CODES,
    CallReportSectionCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import {
    BucketScore,
    aggregateBucketScores,
    bucketOfCallType,
} from './buckets';
import { callScore10 } from './matrix-cell';
import { MetricValue, scoreMetric } from './metric';
import { AnalysisSection } from './sections.util';

/**
 * Звонок для агрегата качества за период (план §4.3). Структурно совместим
 * с AnalyticsCallLiteRow: score — weightedScore 0–100 (null — разбора нет),
 * callType — AI-тип, sections — разделы рубрики с relevance и оценкой.
 */
export interface QualityCall {
    callType: string | null;
    score: number | null;
    sections: readonly AnalysisSection[];
}

/** Раздел рубрики за период: собственное n_j, среднее 1–10 и вес раздела. */
export interface SectionQuality {
    section: string;
    /** scoreMetric по оценкам раздела: none при n < 8, ok при n ≥ 20. */
    score: MetricValue;
    /** Собственное n_j — только звонки с relevance > 0 и оценкой. */
    n: number;
    /** Средняя relevance 0–100 по тем же звонкам (фактический вес, §4.3). */
    avgRelevance: number;
}

/** Качество за период: общее среднее, корзины и разделы рубрики. */
export interface QualityPeriod {
    /** Оценённых звонков с корзиной (contact/presentation/closing). */
    n: number;
    /** Оценённых звонков без корзины (other, irrelevant, тип не определён). */
    nNoBucket: number;
    /** S̄ по звонкам с корзиной (шкала 1–10). */
    score: MetricValue;
    buckets: BucketScore[];
    sections: SectionQuality[];
}

/** Оценка звонка S = weightedScore/10 (план §4.3, шкала 1–10). */
export const qualityScoreOfCall = (weightedScore: number): number =>
    callScore10({ score: weightedScore });

type ScoredCall = QualityCall & { score: number };

const isScoredCall = (call: QualityCall): call is ScoredCall =>
    call.score !== null && Number.isFinite(call.score);

const sectionRank = (section: string): number => {
    const index = (CALL_REPORT_SECTION_CODES as readonly string[]).indexOf(
        section,
    );
    return index === -1 ? CALL_REPORT_SECTION_CODES.length : index;
};

/** Порядок разделов: по рубрике, неизвестные — после них по алфавиту. */
export const compareSectionCodes = (a: string, b: string): number =>
    sectionRank(a) - sectionRank(b) || a.localeCompare(b);

/** Известный код раздела рубрики (CALL_REPORT_SECTION_CODES). */
export function isSectionCode(
    value: string | null | undefined,
): value is CallReportSectionCode {
    return (
        typeof value === 'string' &&
        (CALL_REPORT_SECTION_CODES as readonly string[]).includes(value)
    );
}

/**
 * Оценки корзин за период (contact = cold + call + site_lead, presentation,
 * closing = refine + decision + payment — карта из buckets.ts): S = score/10,
 * звонки без разбора и без корзины не участвуют.
 */
export function aggregateQualityByBucket(
    calls: readonly QualityCall[],
): BucketScore[] {
    return aggregateBucketScores(
        calls.filter(isScoredCall).map(call => ({
            callType: call.callType,
            score: qualityScoreOfCall(call.score),
        })),
    );
}

/**
 * Разделы рубрики за период: в раздел j попадают ТОЛЬКО звонки с
 * relevance_ij > 0 и оценкой раздела — у каждого раздела собственное n_j
 * (план §4.3). Раздел без единого relevance > 0 в агрегат не попадает.
 */
export function aggregateQualityBySection(
    calls: readonly QualityCall[],
): SectionQuality[] {
    const groups = new Map<string, { scores: number[]; relevance: number[] }>();
    for (const call of calls) {
        for (const section of call.sections) {
            if (section.relevance <= 0 || section.score === null) {
                continue;
            }
            const group = groups.get(section.section) ?? {
                scores: [],
                relevance: [],
            };
            group.scores.push(section.score);
            group.relevance.push(section.relevance);
            groups.set(section.section, group);
        }
    }
    return [...groups.entries()]
        .sort(([a], [b]) => compareSectionCodes(a, b))
        .map(([section, group]) => ({
            section,
            score: scoreMetric(group.scores),
            n: group.scores.length,
            avgRelevance:
                group.relevance.reduce((acc, value) => acc + value, 0) /
                group.relevance.length,
        }));
}

/**
 * Качество за период по менеджеру (или отделу): S = weightedScore/10,
 * агрегат по корзинам и по разделам с собственными n. Доверие — по порогам
 * 4.11: n < 8 → none и значение не показывается.
 */
export function buildQualityPeriod(
    calls: readonly QualityCall[],
): QualityPeriod {
    const scored = calls.filter(isScoredCall);
    const bucketed = scored.filter(
        call => bucketOfCallType(call.callType) !== null,
    );
    return {
        n: bucketed.length,
        nNoBucket: scored.length - bucketed.length,
        score: scoreMetric(
            bucketed.map(call => qualityScoreOfCall(call.score)),
        ),
        buckets: aggregateQualityByBucket(calls),
        sections: aggregateQualityBySection(calls),
    };
}
