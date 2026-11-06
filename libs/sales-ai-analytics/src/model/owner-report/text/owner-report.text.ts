import { formatRuDayMonth } from '../../iso-week.util';
import type {
    OwnerReportFacts,
    OwnerReportLeak,
    OwnerReportSign,
} from '../owner-report.types';
import {
    countText,
    moneyText,
    pctText,
    periodText,
    pointsDeltaText,
    REPORT_FORMS,
    shareOfText,
    shareText,
} from './owner-report.format';
import {
    ISSUE_LABELS,
    LEAK_LABELS,
    MANAGEMENT_VERDICT_LABELS,
    METRIC_LABELS,
    NATURE_LABELS,
    OUTCOME_LABELS,
    PERIOD_KIND_LABELS,
    SIGN_LABELS,
    SIGN_VERDICT_LABELS,
    TOPIC_LABELS,
    TYPE_GROUP_LABELS,
} from './owner-report.labels';
import { buildManagerTexts } from './owner-report.text.managers';
import { buildSummaryParagraphs } from './owner-report.text.summary';
import type {
    OwnerReportLeakText,
    OwnerReportManagementText,
    OwnerReportOverviewText,
    OwnerReportText,
    OwnerReportTile,
} from './owner-report.text.types';

/**
 * Шаблонный текст отчёта собственнику из фактов периода. Детерминирован:
 * отчёт выходит всегда, даже без модели; модель поверх него заменяет
 * резюме, абзацы утечек и выводы по сотрудникам (`applyNarrative`).
 */

export interface OwnerReportTextOptions {
    /** Факты прошлого периода той же длины — для сравнений в шапке. */
    previous?: OwnerReportFacts | null;
    /** Имена сотрудников по Bitrix ID; нет — «Сотрудник N». */
    names?: Readonly<Record<string, string>>;
}

export function buildOwnerReportText(
    facts: OwnerReportFacts,
    options: OwnerReportTextOptions = {},
): OwnerReportText {
    const previous = options.previous ?? null;
    return {
        title: `Управленческий отчёт по отделу продаж за ${PERIOD_KIND_LABELS[facts.period.kind]}`,
        periodLabel: periodText(facts.period.from, facts.period.to),
        tiles: buildTiles(facts, previous),
        summary: buildSummaryParagraphs(facts),
        summarySource: 'template',
        overview: buildOverview(facts),
        leaks: facts.leaks.map(leakText),
        management: buildManagementText(facts),
        objections: buildObjectionsText(facts),
        issues: buildIssuesText(facts),
        controlMetrics: facts.controlMetrics.map(metric => ({
            code: metric.code,
            title: METRIC_LABELS[metric.code]?.title ?? metric.code,
            value: shareText(metric.share),
            lastWeek: metric.lastWeek ? shareText(metric.lastWeek) : null,
            why: METRIC_LABELS[metric.code]?.why ?? '',
            ifIgnored: METRIC_LABELS[metric.code]?.ifIgnored ?? '',
        })),
        managers: buildManagerTexts(facts, options.names ?? {}),
        methodology: buildMethodology(facts),
    };
}

/** Пять плиток шапки; сравнение — разница долей в пунктах к прошлому периоду. */
function buildTiles(
    facts: OwnerReportFacts,
    previous: OwnerReportFacts | null,
): OwnerReportTile[] {
    const group = (code: string, source: OwnerReportFacts) =>
        source.byTypeGroup.find(row => row.group === code);
    const noContact = (source: OwnerReportFacts) => {
        const n = source.coverage.analyzed + source.coverage.short;
        const successes =
            source.outcomes.byOutcome.no_contact + source.coverage.short;
        return { successes, n, pct: n > 0 ? (successes / n) * 100 : null };
    };
    const followupNoDecision = (source: OwnerReportFacts) => {
        const followup = group('followup', source);
        if (!followup) return null;
        const successes = followup.calls - followup.byOutcome.advanced;
        return {
            successes,
            n: followup.calls,
            pct: followup.calls > 0 ? (successes / followup.calls) * 100 : null,
        };
    };
    const compare = (
        current: number | null,
        prev: number | null | undefined,
    ) => (previous ? pointsDeltaText(current, prev ?? null) : null);

    const contact = noContact(facts);
    const cold = group('cold', facts);
    const followup = followupNoDecision(facts);
    return [
        {
            code: 'analyzed',
            value: String(facts.coverage.analyzed),
            label: 'разговоров разобрано',
            compare:
                previous === null
                    ? null
                    : `в прошлом периоде ${previous.coverage.analyzed}`,
        },
        {
            code: 'no_contact',
            value: pctText(contact.pct),
            label: 'разговоров без содержательного контакта',
            compare: compare(contact.pct, previous && noContact(previous).pct),
        },
        {
            code: 'cold_advanced',
            value: pctText(cold?.advancedOfAll.pct ?? null),
            label: 'холодных звонков дошли до показа, доступа или предложения',
            compare: compare(
                cold?.advancedOfAll.pct ?? null,
                previous && group('cold', previous)?.advancedOfAll.pct,
            ),
        },
        {
            code: 'followup_no_decision',
            value: pctText(followup?.pct ?? null),
            label: 'разговоров дожима закончились без решения',
            compare: compare(
                followup?.pct ?? null,
                previous && followupNoDecision(previous)?.pct,
            ),
        },
        {
            code: 'postponed_with_date',
            value: pctText(facts.outcomes.postponedWithDate.pct),
            label: 'отложенных разговоров имеют дату возврата',
            compare: compare(
                facts.outcomes.postponedWithDate.pct,
                previous?.outcomes.postponedWithDate.pct,
            ),
        },
    ];
}

function buildOverview(facts: OwnerReportFacts): OwnerReportOverviewText {
    const analyzed = facts.coverage.analyzed;
    const notes: string[] = [];
    if (facts.coverage.silentWorkdays.length > 0) {
        notes.push(
            `Рабочие дни без звонков: ${facts.coverage.silentWorkdays.map(formatRuDayMonth).join(', ')}.`,
        );
    }
    if (facts.coverage.outcomeDerived > 0) {
        notes.push(
            `У ${countText(facts.coverage.outcomeDerived, REPORT_FORMS.callsGenitive)} исход выведен по прежним полям разбора` +
                (facts.coverage.factsSince
                    ? `; полные факты считаются с ${formatRuDayMonth(facts.coverage.factsSince)}.`
                    : '.'),
        );
    }
    return {
        outcomes: (
            Object.keys(OUTCOME_LABELS) as (keyof typeof OUTCOME_LABELS)[]
        ).map(code => ({
            label: OUTCOME_LABELS[code],
            calls: facts.outcomes.byOutcome[code],
            pct: pctText(
                analyzed > 0
                    ? (facts.outcomes.byOutcome[code] / analyzed) * 100
                    : null,
            ),
        })),
        typeGroups: facts.byTypeGroup.map(row => ({
            label: TYPE_GROUP_LABELS[row.group],
            calls: row.calls,
            advanced: shareText(row.advancedOfAll),
            callbackDated: row.byOutcome.callback_dated,
            postponed: row.byOutcome.postponed,
            refused: row.byOutcome.refused,
            noContact: row.byOutcome.no_contact,
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

function weekNote(partial: boolean, silent: readonly string[]): string | null {
    const parts: string[] = [];
    if (partial) parts.push('неполная неделя');
    if (silent.length > 0) {
        parts.push(`нет звонков: ${silent.map(formatRuDayMonth).join(', ')}`);
    }
    return parts.length > 0 ? parts.join('; ') : null;
}

function leakText(leak: OwnerReportLeak): OwnerReportLeakText {
    const label = LEAK_LABELS[leak.code];
    const scale = `${leak.scale.successes} из ${leak.scale.n} ${label.base} (${pctText(leak.scale.pct)})`;
    const money = leak.money
        ? `около ${moneyText(leak.money.amount)}, если вернуть хотя бы ${countText(leak.money.deals, REPORT_FORMS.dealsAccusative)} из этого пула` +
          (leak.money.basis === 'crm'
              ? ' — по среднему чеку CRM'
              : ' — по ценам из разговоров')
        : null;
    return {
        code: leak.code,
        title: label.title,
        scale,
        money,
        nature: NATURE_LABELS[leak.nature],
        action: label.action,
        text: `${label.title}: ${scale}.${money ? ` Цена вопроса — ${money}.` : ''} ${NATURE_LABELS[leak.nature]}.`,
        source: 'template',
        examples: leak.examples,
    };
}

function signDetail(sign: OwnerReportSign): string {
    const label = SIGN_LABELS[sign.code];
    if (!label) return '';
    if (sign.verdict === 'unknown') return 'данных за период нет';
    const words = label[sign.verdict];
    if (sign.value === null) return words;
    if (sign.code === 'unified_pricing') {
        return `${words}: разброс в ${sign.value.toFixed(1).replace('.', ',')} раза`;
    }
    if (sign.code === 'plan_fact') {
        return `${words}: ${pctText(sign.value * 100)} плана`;
    }
    return `${words}: ${pctText(sign.value)}`;
}

function buildManagementText(
    facts: OwnerReportFacts,
): OwnerReportManagementText {
    const counts = { yes: 0, partial: 0, no: 0, unknown: 0 };
    for (const sign of facts.management.signs) counts[sign.verdict] += 1;
    const checked = counts.yes + counts.partial + counts.no;
    return {
        rows: facts.management.signs.map(sign => ({
            code: sign.code,
            title: SIGN_LABELS[sign.code]?.title ?? sign.code,
            verdict: SIGN_VERDICT_LABELS[sign.verdict],
            detail: signDetail(sign),
        })),
        verdict: MANAGEMENT_VERDICT_LABELS[facts.management.verdict],
        verdictText: `Проверено ${checked} из ${facts.management.signs.length} признаков: есть — ${counts.yes}, частично — ${counts.partial}, нет — ${counts.no}.`,
    };
}

function buildObjectionsText(facts: OwnerReportFacts) {
    const { objections } = facts;
    const coldTop =
        objections.coldNotAdvancedTop.length > 0
            ? `Среди холодных звонков без продвижения чаще всего звучит: ${objections.coldNotAdvancedTop
                  .map(
                      item =>
                          `«${TOPIC_LABELS[item.topic] ?? item.topic}» (${item.calls})`,
                  )
                  .join(', ')}.`
            : null;
    return {
        intro: `Возражения прозвучали в ${shareOfText(objections.callsWithObjections, REPORT_FORMS.callsGenitive)} с решающим (${pctText(objections.callsWithObjections.pct)}); отработано ${pctText(objections.handled.pct)} возражений.`,
        rows: objections.byTopic.map(row => ({
            label: TOPIC_LABELS[row.topic] ?? row.topic,
            calls: row.calls,
            handled: pctText(row.handled.pct),
            advancedAfter: pctText(row.advancedAfter.pct),
        })),
        coldTop,
    };
}

function buildIssuesText(facts: OwnerReportFacts) {
    const { issues } = facts;
    return {
        intro:
            issues.callsWithIssues.n === 0
                ? 'Сбои не по вине разговора в этом периоде не отмечались.'
                : `Сбои не по вине разговора видны в ${shareOfText(issues.callsWithIssues, REPORT_FORMS.callsGenitive)} (${pctText(issues.callsWithIssues.pct)}).`,
        rows: issues.byCode.map(row => ({
            label: ISSUE_LABELS[row.code] ?? row.code,
            calls: row.calls,
            examples: row.examples,
        })),
    };
}

function buildMethodology(facts: OwnerReportFacts): string[] {
    const { coverage } = facts;
    const lines = [
        `Период ${periodText(facts.period.from, facts.period.to)}. Звонков за период — ${coverage.calls}, из них с разбором — ${coverage.analyzed}; короче порога — ${coverage.short}, без разбора — ${coverage.noAnalysis}, без сотрудника — ${coverage.noManager}.`,
        'Каждый разговор размечен разбором по единой схеме: тип, исход, возражения, сбои, цены, признаки качества. Все доли посчитаны по разметке, без поиска по словам; конверсия входа считается только по холодным первым контактам.',
    ];
    if (coverage.outcomeDerived > 0) {
        lines.push(
            `У ${coverage.outcomeDerived} из ${coverage.analyzed} разговоров исход выведен по прежним полям разбора (следующий шаг, отказ, собеседник)` +
                (coverage.factsSince
                    ? `; новые факты считаются с ${formatRuDayMonth(coverage.factsSince)}.`
                    : '.'),
        );
    }
    lines.push(
        'Сотрудник определён по телефонии, а не по самопредставлению. Исход зафиксирован по договорённости в разговоре; сверка со сделками и оплатами в CRM — отдельный раздел.',
    );
    if (coverage.telephony?.outbound) {
        lines.push(
            `По телефонии: исходящих вызовов — ${coverage.telephony.outbound}, состоявшихся разговоров — ${coverage.telephony.connected ?? '—'}.`,
        );
    }
    return lines;
}
