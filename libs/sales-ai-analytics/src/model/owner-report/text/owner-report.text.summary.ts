import type { OwnerReportFacts, OwnerShare } from '../owner-report.types';
import { ISSUE_LABELS, TYPE_GROUP_LABELS } from './owner-report.labels';
import {
    countText,
    moneyText,
    pctText,
    REPORT_FORMS,
    shareOfText,
} from './owner-report.format';

/**
 * Резюме для собственника шаблоном: до семи абзацев по фактам периода —
 * объём и контакт, дожим, отложенные, вход, динамика, зависимость от
 * людей, цены, сбои, что работает. Модель вправе заменить его своим
 * текстом после факт-чека.
 */

export const SUMMARY_PARAGRAPHS_LIMIT = 7;

/** Сколько разговоров группы нужно, чтобы назвать её «работающим звеном». */
const WORKING_LINK_MIN_CALLS = 5;
const WORKING_LINK_MIN_PCT = 50;

const has = (share: OwnerShare): boolean => share.n > 0;

export function buildSummaryParagraphs(facts: OwnerReportFacts): string[] {
    const paragraphs = [
        volumeParagraph(facts),
        followupParagraph(facts),
        postponedParagraph(facts),
        coldParagraph(facts),
        trendParagraph(facts),
        peopleParagraph(facts),
        pricesParagraph(facts),
        issuesParagraph(facts),
        workingLinkParagraph(facts),
    ].filter((text): text is string => text !== null);
    return paragraphs.slice(0, SUMMARY_PARAGRAPHS_LIMIT);
}

function volumeParagraph(facts: OwnerReportFacts): string {
    const { coverage, outcomes } = facts;
    const noContact = outcomes.byOutcome.no_contact;
    return (
        `Разобрано ${countText(coverage.analyzed, REPORT_FORMS.calls)}` +
        (coverage.short > 0 ? `, ещё ${coverage.short} короче порога` : '') +
        `. С решающим состоялось ${countText(outcomes.contacted, REPORT_FORMS.calls)}, до него не дошли ${noContact}.`
    );
}

function followupParagraph(facts: OwnerReportFacts): string | null {
    const followup = facts.byTypeGroup.find(row => row.group === 'followup');
    if (!followup) return null;
    const noDecision = followup.calls - followup.byOutcome.advanced;
    return `Дожим: из ${countText(followup.calls, REPORT_FORMS.callsGenitive)} после показа и предложения без решения остались ${noDecision} (${pctText(
        followup.calls > 0 ? (noDecision / followup.calls) * 100 : null,
    )}); шаг вперёд — в ${followup.byOutcome.advanced}.`;
}

function postponedParagraph(facts: OwnerReportFacts): string | null {
    const { outcomes } = facts;
    const postponed = outcomes.byOutcome.postponed;
    if (postponed === 0) return null;
    return `Отложено без даты возврата — ${countText(postponed, REPORT_FORMS.calls)} (${pctText(
        outcomes.contacted > 0 ? (postponed / outcomes.contacted) * 100 : null,
    )} разговоров с решающим); дата возврата есть у ${outcomes.postponedWithDate.successes} из ${outcomes.postponedWithDate.n} отложенных и перезвонов.`;
}

function coldParagraph(facts: OwnerReportFacts): string | null {
    const cold = facts.byTypeGroup.find(row => row.group === 'cold');
    if (!cold) return null;
    const contacted = cold.calls - cold.byOutcome.no_contact;
    return `Холодный вход: из ${countText(cold.calls, REPORT_FORMS.callsGenitive)} до решающего дошли ${contacted}, до показа, доступа или предложения — ${cold.byOutcome.advanced} (${pctText(cold.advancedOfAll.pct)}).`;
}

function trendParagraph(facts: OwnerReportFacts): string | null {
    const full = facts.weeks.filter(week => !week.partial && week.cold > 0);
    if (full.length < 2) return null;
    const first = full[0];
    const last = full[full.length - 1];
    if (first.coldAdvanced.pct === null || last.coldAdvanced.pct === null) {
        return null;
    }
    const direction =
        last.coldAdvanced.pct < first.coldAdvanced.pct
            ? 'снизилась'
            : last.coldAdvanced.pct > first.coldAdvanced.pct
              ? 'выросла'
              : 'не изменилась';
    return `Доля холодных звонков с продвижением ${direction}: с ${pctText(first.coldAdvanced.pct)} в первую полную неделю до ${pctText(last.coldAdvanced.pct)} в последнюю.`;
}

function peopleParagraph(facts: OwnerReportFacts): string | null {
    const top = facts.controlMetrics.find(
        metric => metric.code === 'top_manager_share',
    );
    if (!top || !has(top.share)) return null;
    const leader = facts.managers.find(
        row => row.advancedShareOfTeam.successes === top.share.successes,
    );
    const callsShare = leader ? pctText(leader.shareOfTeam.pct) : null;
    return `Один сотрудник даёт ${shareOfText(top.share, ['продвижение', 'продвижения', 'продвижений'])} команды (${pctText(top.share.pct)})${callsShare ? ` при ${callsShare} разговоров` : ''}.`;
}

function pricesParagraph(facts: OwnerReportFacts): string | null {
    const { prices } = facts;
    if (prices.n === 0) return null;
    const spread = prices.byPeriod.find(
        item => item.range.min !== item.range.max,
    );
    if (spread) {
        return `Единых цен нет: за ${countText(spread.periodMonths, ['месяц', 'месяца', 'месяцев'])} в разных разговорах звучало от ${moneyText(spread.range.min)} до ${moneyText(spread.range.max)}.`;
    }
    return `Цены в разговорах совпадают: ${countText(prices.n, ['цена', 'цены', 'цен'])} без расхождений.`;
}

function issuesParagraph(facts: OwnerReportFacts): string | null {
    const { issues } = facts;
    if (issues.callsWithIssues.successes === 0) return null;
    const top = issues.byCode[0];
    return `В ${shareOfText(issues.callsWithIssues, REPORT_FORMS.callsGenitive)} (${pctText(issues.callsWithIssues.pct)}) видны сбои не по вине разговора; чаще всего — ${(ISSUE_LABELS[top.code] ?? top.code).toLowerCase()} (${top.calls}).`;
}

function workingLinkParagraph(facts: OwnerReportFacts): string | null {
    const best = facts.byTypeGroup
        .filter(
            row =>
                row.group !== 'cold' &&
                row.advancedOfContacted.n >= WORKING_LINK_MIN_CALLS &&
                (row.advancedOfContacted.pct ?? 0) >= WORKING_LINK_MIN_PCT,
        )
        .sort(
            (a, b) =>
                (b.advancedOfContacted.pct ?? 0) -
                (a.advancedOfContacted.pct ?? 0),
        )[0];
    if (!best) return null;
    return `Работающее звено — ${TYPE_GROUP_LABELS[best.group].toLowerCase()}: ${pctText(best.advancedOfContacted.pct)} таких разговоров с решающим двигают клиента дальше.`;
}
