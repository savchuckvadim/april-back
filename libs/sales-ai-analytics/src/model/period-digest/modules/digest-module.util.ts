import type { CallReportSectionCode } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import {
    isBelowDepartment,
    weakSectionsOf,
} from '../../attention.sections.util';
import type { AttentionSectionMean } from '../../attention.types';
import type { DatedLiteRow } from '../../dated-lite-row';
import { sectionTitleOf } from '../../dictionary-titles.util';
import { RuPluralForms, ruCount, ruDecimal } from '../../ru-text.util';
import { nonEmptyText } from '../../sections.util';
import {
    digestAnchorRows,
    measureDigestAnchor,
} from '../period-digest.anchors';
import { DIGEST_ANCHOR_METRIC } from '../period-digest.codes';
import { DIGEST_EVIDENCE_MAX } from '../period-digest.thresholds';
import type {
    DigestAnchor,
    DigestRecommendation,
} from '../period-digest.types';
import type {
    DigestDetection,
    DigestModuleContext,
} from './digest-module.types';

/**
 * Общее для модулей рекомендаций: коды разделов, формы слов при числах,
 * база якоря с минимумом наблюдений, слабый раздел по правилу «Внимания»
 * и звонки-примеры. Чистые функции.
 */

/** Разделы рубрики, о которых говорят модули презентаций. */
export const DIGEST_SECTION = {
    needs: 'NEEDS',
    presentation: 'PRESENTATION',
} as const satisfies Record<string, CallReportSectionCode>;

/** Формы слов при числах, которых нет в общем словаре витрины. */
export const DIGEST_FORMS = {
    /** «по 7 презентациям». */
    presentationsDative: ['презентации', 'презентациям', 'презентациям'],
    /** «по 12 звонкам». */
    callsDative: ['звонку', 'звонкам', 'звонкам'],
    /** «из 41 звонка». */
    callsGenitive: ['звонка', 'звонков', 'звонков'],
    /** «из 20 возражений». */
    objectionsGenitive: ['возражения', 'возражений', 'возражений'],
    /** «из 15 назначенных шагов». */
    stepsGenitive: [
        'назначенного шага',
        'назначенных шагов',
        'назначенных шагов',
    ],
} as const satisfies Record<string, RuPluralForms>;

/** Доля целым процентом: «41 %». */
export const digestPercent = (share: number): string =>
    `${Math.round(share * 100)} %`;

/** Сколько попаданий за долей: 0,55 из 20 → 11. */
export const digestHitsOf = (value: number, n: number): number =>
    Math.round(value * n);

/** База якоря: значение есть и наблюдений не меньше минимума; иначе null. */
export function digestBaselineOf(
    anchor: DigestAnchor,
    context: DigestModuleContext,
): DigestDetection['baseline'] | null {
    const measured = measureDigestAnchor(anchor, context.rows, {
        lowScoreCallMax: context.rules.lowScoreCallMax,
    });
    return measured.value !== null && measured.n >= context.minN
        ? { value: measured.value, n: measured.n }
        : null;
}

/** Оценка раздела у звонка, если раздел применим и оценён. */
const sectionScoreOf = (row: DatedLiteRow, section: string) =>
    row.sections.find(
        item =>
            item.section === section &&
            item.relevance > 0 &&
            item.score !== null,
    ) ?? null;

/**
 * Примеры к разделу: звонки якоря с оценкой раздела не выше порога (нет
 * порога — все), худшие первыми; цитата — фраза «как было» худшего.
 */
export function digestSectionEvidence(
    anchor: DigestAnchor,
    rows: readonly DatedLiteRow[],
    maxScore: number | null,
): DigestRecommendation['evidence'] {
    const section = anchor.section ?? '';
    const scored = digestAnchorRows(anchor, rows)
        .flatMap(row => {
            const item = sectionScoreOf(row, section);
            return item?.score !== null && item?.score !== undefined
                ? [{ row, score: item.score, asWas: item.asWas }]
                : [];
        })
        .filter(item => maxScore === null || item.score <= maxScore)
        .sort(
            (a, b) =>
                a.score - b.score ||
                a.row.transcriptionId.localeCompare(b.row.transcriptionId),
        );
    return {
        transcriptionIds: scored
            .slice(0, DIGEST_EVIDENCE_MAX)
            .map(item => item.row.transcriptionId),
        quote:
            scored.map(item => nonEmptyText(item.asWas)).find(Boolean) ?? null,
    };
}

/** Звонки-примеры по признаку: по порядку id, не больше пяти. */
export const digestEvidenceOf = (
    rows: readonly DatedLiteRow[],
    quote: string | null = null,
): DigestRecommendation['evidence'] => ({
    transcriptionIds: rows
        .map(row => row.transcriptionId)
        .sort((a, b) => a.localeCompare(b))
        .slice(0, DIGEST_EVIDENCE_MAX),
    quote,
});

/**
 * Слабый раздел по правилу «Внимания» (оценка не выше порога или ниже
 * среднего по отделу на разрыв): якорь — средняя раздела на звонках типов,
 * норма — среднее отдела, если сработал разрыв, иначе порог «слабого» с
 * запасом на сдвиг.
 */
export function detectWeakSection(
    context: DigestModuleContext,
    section: string,
    sections: readonly AttentionSectionMean[],
    callTypes: readonly string[],
): DigestDetection | null {
    const [weak] = weakSectionsOf(
        sections,
        context.benchmarks,
        [section],
        context.rules,
    );
    if (!weak) return null;
    const anchor: DigestAnchor = {
        metric: DIGEST_ANCHOR_METRIC.sectionMean,
        section,
        callTypes,
    };
    const baseline = digestBaselineOf(anchor, context);
    if (!baseline) return null;
    const belowDepartment = isBelowDepartment(weak, context.rules);
    return {
        anchor,
        baseline,
        norm:
            belowDepartment && weak.benchmark
                ? weak.benchmark.mean
                : context.rules.weakSectionScoreMax + context.shift.score,
        comparison: belowDepartment ? 'ниже среднего по отделу' : null,
        evidence: digestSectionEvidence(
            anchor,
            context.rows,
            context.rules.weakSectionScoreMax,
        ),
    };
}

/** «4,2 из 10 по 7 презентациям, ниже среднего по отделу» */
export function digestSectionNumbers(
    detection: DigestDetection,
    forms: RuPluralForms,
): string {
    const facts =
        `${ruDecimal(detection.baseline.value)} из 10 ` +
        `по ${ruCount(detection.baseline.n, forms)}`;
    return detection.comparison ? `${facts}, ${detection.comparison}` : facts;
}

/** «Выявление потребностей» — 4,2 из 10 по 7 презентациям, ниже среднего по отделу */
export const digestSectionFacts = (
    detection: DigestDetection,
    forms: RuPluralForms,
): string =>
    `«${sectionTitleOf(detection.anchor.section ?? '')}» — ` +
    digestSectionNumbers(detection, forms);
