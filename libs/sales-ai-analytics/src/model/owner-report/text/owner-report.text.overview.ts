import { formatRuDayMonth } from '../../iso-week.util';
import type { OwnerReportFacts } from '../owner-report.types';
import {
    countText,
    pctText,
    periodText,
    pointsDeltaText,
    REPORT_FORMS,
    shareText,
} from './owner-report.format';
import {
    OUTCOME_LABELS,
    TYPE_GROUP_LABELS,
    UNMARKED_OUTCOME_LABEL,
} from './owner-report.labels';
import {
    OWNER_REPORT_TILE_THRESHOLDS,
    ownerReportToneOf,
} from './owner-report.attention';
import type {
    OwnerReportOverviewText,
    OwnerReportTile,
} from './owner-report.text.types';

/**
 * Шапка и «Общая картина» отчёта собственнику: плитки с тоном, исходы,
 * виды разговоров, недели и пометка о неразмеченных исходах. Вынесено из
 * owner-report.text.ts по лимиту файла.
 */

/** Пять плиток шапки; сравнение — разница долей в пунктах к прошлому периоду. */
export function buildTiles(
    facts: OwnerReportFacts,
    previous: OwnerReportFacts | null,
): OwnerReportTile[] {
    const group = (code: string, source: OwnerReportFacts) =>
        source.byTypeGroup.find(row => row.group === code);
    // Доли исходов — только по размеченным разговорам; без них — прочерк.
    const noContact = (source: OwnerReportFacts) => {
        const marked = source.coverage.analyzed - source.outcomes.unmarked;
        if (marked === 0) return { pct: null };
        const n = marked + source.coverage.short;
        const successes =
            source.outcomes.byOutcome.no_contact + source.coverage.short;
        return { pct: (successes / n) * 100 };
    };
    const followupNoDecision = (source: OwnerReportFacts) => {
        const followup = group('followup', source);
        if (!followup) return null;
        const marked = followup.calls - followup.unmarked;
        const successes = marked - followup.byOutcome.advanced;
        return { pct: marked > 0 ? (successes / marked) * 100 : null };
    };
    const unmarkedNote =
        facts.coverage.outcomeFromAnalysis === 0
            ? 'исход в разборах периода не размечен'
            : null;
    const compare = (
        current: number | null,
        prev: number | null | undefined,
    ) =>
        current === null
            ? unmarkedNote
            : previous
              ? pointsDeltaText(current, prev ?? null)
              : null;

    const shares: {
        code: string;
        label: string;
        pct: number | null;
        prev: number | null | undefined;
    }[] = [
        {
            code: 'no_contact',
            label: 'разговоров без содержательного контакта',
            pct: noContact(facts).pct,
            prev: previous && noContact(previous).pct,
        },
        {
            code: 'cold_advanced',
            label: 'холодных звонков дошли до показа, доступа или предложения',
            pct: group('cold', facts)?.advancedOfAll.pct ?? null,
            prev: previous && group('cold', previous)?.advancedOfAll.pct,
        },
        {
            code: 'followup_no_decision',
            label: 'разговоров дожима закончились без решения',
            pct: followupNoDecision(facts)?.pct ?? null,
            prev: previous && followupNoDecision(previous)?.pct,
        },
        {
            code: 'postponed_with_date',
            label: 'отложенных разговоров имеют дату возврата',
            pct: facts.outcomes.postponedWithDate.pct,
            prev: previous?.outcomes.postponedWithDate.pct,
        },
    ];
    return [
        {
            code: 'analyzed',
            value: String(facts.coverage.analyzed),
            label: 'разговоров разобрано',
            compare:
                previous === null
                    ? null
                    : `в прошлом периоде ${previous.coverage.analyzed}`,
            tone: 'neutral',
        },
        ...shares.map(share => ({
            code: share.code,
            value: pctText(share.pct),
            label: share.label,
            compare: compare(share.pct, share.prev),
            tone: ownerReportToneOf(
                share.pct,
                OWNER_REPORT_TILE_THRESHOLDS[share.code],
            ),
        })),
    ];
}

export function buildOverview(
    facts: OwnerReportFacts,
): OwnerReportOverviewText {
    const unmarked = facts.outcomes.unmarked;
    const marked = facts.coverage.analyzed - unmarked;
    const notes: string[] = [];
    if (facts.coverage.silentWorkdays.length > 0) {
        notes.push(
            `Рабочие дни без звонков: ${facts.coverage.silentWorkdays.map(formatRuDayMonth).join(', ')}.`,
        );
    }
    const unmarkedLine = unmarkedNoteOf(facts);
    if (unmarkedLine) notes.push(unmarkedLine);
    const outcomeRows = (
        Object.keys(OUTCOME_LABELS) as (keyof typeof OUTCOME_LABELS)[]
    ).map(code => ({
        label: OUTCOME_LABELS[code],
        calls: facts.outcomes.byOutcome[code],
        pct: pctText(
            marked > 0 ? (facts.outcomes.byOutcome[code] / marked) * 100 : null,
        ),
    }));
    return {
        outcomes:
            unmarked > 0
                ? [
                      ...outcomeRows,
                      {
                          label: UNMARKED_OUTCOME_LABEL,
                          calls: unmarked,
                          pct: '',
                      },
                  ]
                : outcomeRows,
        typeGroups: facts.byTypeGroup.map(row => ({
            label: TYPE_GROUP_LABELS[row.group],
            calls: row.calls,
            advanced: shareText(row.advancedOfAll),
            callbackDated: row.byOutcome.callback_dated,
            postponed: row.byOutcome.postponed,
            refused: row.byOutcome.refused,
            noContact: row.byOutcome.no_contact,
            unmarked: row.unmarked,
        })),
        weeks: facts.weeks.map(week => ({
            label: periodText(week.from, week.to),
            calls: week.calls,
            cold: week.cold,
            coldAdvanced: shareText(week.coldAdvanced),
            contacted: week.contacted,
            contactedAdvanced: shareText(week.contactedAdvanced),
            note: weekNote(week.partial, week.silentWorkdays),
        })),
        notes,
    };
}

/** Строка «исход не размечен»: сколько разговоров и что сделать. */
export function unmarkedNoteOf(facts: OwnerReportFacts): string | null {
    const { coverage } = facts;
    if (coverage.outcomeUnmarked === 0) return null;
    const since = coverage.factsSince
        ? ` (размечается с ${formatRuDayMonth(coverage.factsSince)})`
        : '';
    return coverage.outcomeFromAnalysis === 0
        ? `Исход разговора, сбои, допродажа и темы возражений в разборах этого периода не размечены — они появились в новой версии разбора. Чтобы они были в отчёте, звонки периода переразбирают и отчёт пересобирают.`
        : `Исход размечен у ${coverage.outcomeFromAnalysis} из ${countText(coverage.analyzed, REPORT_FORMS.callsGenitive)}${since}; доли исходов посчитаны по размеченным, остальные ${coverage.outcomeUnmarked} в них не входят.`;
}

function weekNote(partial: boolean, silent: readonly string[]): string | null {
    const parts: string[] = [];
    if (partial) parts.push('неполная неделя');
    if (silent.length > 0) {
        parts.push(`нет звонков: ${silent.map(formatRuDayMonth).join(', ')}`);
    }
    return parts.length > 0 ? parts.join('; ') : null;
}
