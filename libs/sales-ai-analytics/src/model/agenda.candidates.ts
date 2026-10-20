/**
 * Кандидаты повестки планёрки: почему звонок попадает в повестку и с какой
 * цитатой (решение владельца 19.10.2026): слабая презентация → слабая
 * доработка → низкая оценка → риск с цитатой → запасные причины.
 * Отбор и порядок — agenda.ts (лимит 300 строк на файл).
 *
 * Чистые функции.
 */
import {
    ATTENTION_FOLLOWUP_SECTIONS,
    ATTENTION_PRESENTATION_SECTIONS,
    isFollowupCallType,
    isPresentationCallType,
} from './attention.sections.util';
import type {
    AgendaCallRow,
    AgendaObjection,
    AgendaReasonKind,
} from './agenda.types';
import {
    objectionTitleOf,
    riskTitleOf,
    sectionTitleOf,
} from './dictionary-titles.util';
import { provenRiskFlags } from './risk-flags.util';
import { ruDecimal } from './ru-text.util';
import { ScoredSection, nonEmptyText, pickWorstSection } from './sections.util';

/** Исход возражения, который считаем спорным наравне с handled = false. */
export const AGENDA_DISPUTED_OUTCOME = 'disengaged';

export interface AgendaCandidate {
    row: AgendaCallRow;
    kind: AgendaReasonKind;
    /** Внутри одного kind: меньше — важнее. */
    severity: number;
    reason: string;
    quote: string;
}

export interface AgendaThresholds {
    weakSectionScoreMax: number;
    lowScoreCallMax: number;
}

export const isDisputed = (objection: AgendaObjection): boolean =>
    objection.handled === false ||
    objection.outcome === AGENDA_DISPUTED_OUTCOME;

const firstQuote = (objections: readonly AgendaObjection[]): string | null =>
    objections
        .map(objection => nonEmptyText(objection.quote))
        .find(quote => quote !== null) ?? null;

/** Худший оценённый раздел из заданного набора кодов; нет — null. */
const worstOf = (
    row: AgendaCallRow,
    codes: readonly string[],
): ScoredSection | null =>
    pickWorstSection(row.sections.filter(s => codes.includes(s.section)));

const sectionScoreText = (section: ScoredSection): string =>
    `«${sectionTitleOf(section.section)}» ${section.score} из 10`;

/** «Слабее всего — «Работа по цене»: 3 из 10» — раздел названием, не кодом. */
function sectionReason(section: ScoredSection): string {
    return `Слабее всего — «${sectionTitleOf(section.section)}»: ${section.score} из 10`;
}

/** «Спорное возражение «Цена»: не отработано» — категория названием. */
function objectionReason(objection: AgendaObjection): string {
    const category = objection.category
        ? ` «${objectionTitleOf(objection.category)}»`
        : '';
    const detail =
        objection.handled === false ? 'не отработано' : 'клиент отстранился';
    return `Спорное возражение${category}: ${detail}`;
}

/** Слабая презентация: худший из разделов потребностей / презентации. */
function presentationCandidate(
    row: AgendaCallRow,
    thresholds: AgendaThresholds,
): AgendaCandidate | null {
    if (!isPresentationCallType(row.callType)) return null;
    const weak = worstOf(row, ATTENTION_PRESENTATION_SECTIONS);
    if (!weak || weak.score > thresholds.weakSectionScoreMax) return null;
    return {
        row,
        kind: 'weak_presentation',
        severity: weak.score,
        reason: `Слабая презентация: ${sectionScoreText(weak)}`,
        quote: nonEmptyText(weak.asWas) ?? '',
    };
}

/**
 * Слабая доработка (refine / decision): неотработанное возражение →
 * следующий шаг без даты → слабый раздел возражений / закрытия.
 */
function followupCandidate(
    row: AgendaCallRow,
    thresholds: AgendaThresholds,
    fallbackQuote: string | null,
): AgendaCandidate | null {
    if (!isFollowupCallType(row.callType)) return null;
    const disputed = row.objections.filter(isDisputed);
    const noDate =
        row.nextStep?.set === true && nonEmptyText(row.nextStep.date) === null;
    const weak = worstOf(row, ATTENTION_FOLLOWUP_SECTIONS);
    const weakSection =
        weak && weak.score <= thresholds.weakSectionScoreMax ? weak : null;
    if (disputed.length === 0 && !noDate && weakSection === null) return null;
    const severity =
        -(disputed.length + (noDate ? 1 : 0)) * 10 + (weakSection?.score ?? 10);
    const base = { row, kind: 'weak_followup' as const, severity };
    const sectionQuote = nonEmptyText(weakSection?.asWas);
    if (disputed.length > 0) {
        const detail = objectionReason(disputed[0]).replace(
            'Спорное возражение',
            'возражение',
        );
        return {
            ...base,
            reason: `Слабая доработка: ${detail}`,
            quote: firstQuote(disputed) ?? sectionQuote ?? fallbackQuote ?? '',
        };
    }
    if (noDate) {
        return {
            ...base,
            reason: 'Слабая доработка: следующий шаг без даты',
            quote: sectionQuote ?? fallbackQuote ?? '',
        };
    }
    return {
        ...base,
        reason: `Слабая доработка: ${sectionScoreText(weakSection as ScoredSection)}`,
        quote: sectionQuote ?? '',
    };
}

/** Низкая общая оценка (шкала 0–100 строки → 1–10 порога). */
function lowScoreCandidate(
    row: AgendaCallRow,
    thresholds: AgendaThresholds,
    worst: ScoredSection | null,
    fallbackQuote: string | null,
): AgendaCandidate | null {
    if (row.score === null) return null;
    const score10 = row.score / 10;
    if (score10 > thresholds.lowScoreCallMax) return null;
    const tail = worst
        ? `, ${sectionReason(worst).replace('Слабее всего', 'слабее всего')}`
        : '';
    return {
        row,
        kind: 'low_score',
        severity: score10,
        reason: `Низкая оценка звонка: ${ruDecimal(score10)} из 10${tail}`,
        quote: fallbackQuote ?? '',
    };
}

/** Риск — только действующие флаги с цитатой; цитата — доказательство. */
function riskCandidate(row: AgendaCallRow): AgendaCandidate | null {
    const proven = provenRiskFlags(row.riskFlags, row.riskEvidence);
    if (proven.length === 0) return null;
    return {
        row,
        kind: 'risk',
        severity: -proven.length,
        reason: `Сигналы риска: ${proven.map(item => riskTitleOf(item.flag)).join('; ')}`,
        quote: proven[0].quote,
    };
}

/** Кандидат звонка по приоритету причин; звонок без сигнала — null. */
export function toAgendaCandidate(
    row: AgendaCallRow,
    thresholds: AgendaThresholds,
): AgendaCandidate | null {
    const worst = pickWorstSection(row.sections);
    const fallbackQuote = worst ? nonEmptyText(worst.asWas) : null;

    const primary =
        presentationCandidate(row, thresholds) ??
        followupCandidate(row, thresholds, fallbackQuote) ??
        lowScoreCandidate(row, thresholds, worst, fallbackQuote) ??
        riskCandidate(row);
    if (primary) return primary;

    const disputed = row.objections.filter(isDisputed);
    if (disputed.length > 0) {
        return {
            row,
            kind: 'objection',
            severity: -disputed.length,
            reason: objectionReason(disputed[0]),
            quote: firstQuote(disputed) ?? fallbackQuote ?? '',
        };
    }
    if (worst) {
        return {
            row,
            kind: 'section',
            severity: worst.score,
            reason: sectionReason(worst),
            quote: fallbackQuote ?? '',
        };
    }
    return null;
}
