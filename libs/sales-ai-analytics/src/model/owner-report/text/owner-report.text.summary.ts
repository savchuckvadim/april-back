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
        // Последним: при размеченных исходах вытесняется лимитом, без них —
        // главный абзац о том, что видно в разговорах.
        qualityParagraph(facts),
    ].filter((text): text is string => text !== null);
    return paragraphs.slice(0, SUMMARY_PARAGRAPHS_LIMIT);
}

function volumeParagraph(facts: OwnerReportFacts): string {
    const { coverage, outcomes } = facts;
    const noContact = outcomes.byOutcome.no_contact;
    const head =
        `Разобрано ${countText(coverage.analyzed, REPORT_FORMS.calls)}` +
        (coverage.short > 0 ? `, ещё ${coverage.short} короче порога` : '');
    if (coverage.outcomeFromAnalysis === 0) {
        return `${head}. Исходы разговоров в разборах этого периода не размечены — выводы ниже по тому, что видно в самих разговорах.`;
    }
    const scope =
        outcomes.unmarked > 0
            ? `Из ${countText(coverage.outcomeFromAnalysis, REPORT_FORMS.callsGenitive)} с размеченным исходом с ЛПР`
            : 'С ЛПР';
    return `${head}. ${scope} состоялось ${countText(outcomes.contacted, REPORT_FORMS.calls)}, до ЛПР не дошли ${noContact}.`;
}

function followupParagraph(facts: OwnerReportFacts): string | null {
    const followup = facts.byTypeGroup.find(row => row.group === 'followup');
    if (!followup) return null;
    const marked = followup.calls - followup.unmarked;
    if (marked === 0) return null;
    const noDecision = marked - followup.byOutcome.advanced;
    const invoice =
        facts.funnel.stages.find(stage => stage.code === 'followup')
            ?.invoiceAgreed.successes ?? 0;
    return `Дожим: из ${countText(marked, REPORT_FORMS.callsGenitive)} после показа и предложения без решения остались ${noDecision} (${pctText(
        (noDecision / marked) * 100,
    )}); шаг вперёд — в ${followup.byOutcome.advanced}, согласие на счёт — в ${invoice}.`;
}

function postponedParagraph(facts: OwnerReportFacts): string | null {
    const { outcomes } = facts;
    const postponed = outcomes.byOutcome.postponed;
    if (postponed === 0) return null;
    return `Отложено без даты возврата — ${countText(postponed, REPORT_FORMS.calls)} (${pctText(
        outcomes.contacted > 0 ? (postponed / outcomes.contacted) * 100 : null,
    )} разговоров с ЛПР); дата возврата есть у ${outcomes.postponedWithDate.successes} из ${outcomes.postponedWithDate.n} отложенных и перезвонов.`;
}

function coldParagraph(facts: OwnerReportFacts): string | null {
    const cold = facts.byTypeGroup.find(row => row.group === 'cold');
    if (!cold) return null;
    const marked = cold.calls - cold.unmarked;
    if (marked === 0) return null;
    const contacted = marked - cold.byOutcome.no_contact;
    return `Холодный вход: из ${countText(marked, REPORT_FORMS.callsGenitive)} до ЛПР дошли ${contacted}, до показа, доступа или предложения — ${cold.byOutcome.advanced} (${pctText(cold.advancedOfAll.pct)}).`;
}

/** Что в разговорах видно и без новой разметки: задачи, шаг с датой, возражения. */
const QUALITY_SIGNS: readonly { code: string; phrase: string }[] = [
    { code: 'needs_discovery', phrase: 'задачи клиента выясняют' },
    { code: 'stage_control', phrase: 'шаг с датой фиксируют' },
    { code: 'objections_handling', phrase: 'возражения отрабатывают' },
];

function qualityParagraph(facts: OwnerReportFacts): string | null {
    const parts = QUALITY_SIGNS.flatMap(({ code, phrase }) => {
        const sign = facts.management.signs.find(item => item.code === code);
        if (!sign || sign.value === null || sign.n === 0) return [];
        return [`${phrase} в ${pctText(sign.value)} случаев (из ${sign.n})`];
    });
    if (parts.length === 0) return null;
    return `В разговорах: ${parts.join(', ')}.`;
}

/** «… снизилась: с 16 % в первую полную неделю до 4 % в последнюю». */
function trendText(
    weeks: readonly OwnerReportFacts['weeks'][number][],
    pctOf: (week: OwnerReportFacts['weeks'][number]) => number | null,
    subject: string,
): string | null {
    if (weeks.length < 2) return null;
    const first = pctOf(weeks[0]);
    const last = pctOf(weeks[weeks.length - 1]);
    if (first === null || last === null) return null;
    const direction =
        last < first ? 'снизилась' : last > first ? 'выросла' : 'не изменилась';
    return `${subject} ${direction}: с ${pctText(first)} в первую полную неделю до ${pctText(last)} в последнюю`;
}

/** Динамика по полным неделям: холодный вход и шаг вперёд с ЛПР (образец OrbitAI). */
function trendParagraph(facts: OwnerReportFacts): string | null {
    const full = facts.weeks.filter(week => !week.partial);
    const parts = [
        trendText(
            full.filter(week => week.cold > 0),
            week => week.coldAdvanced.pct,
            'доля холодных звонков с продвижением',
        ),
        trendText(
            full.filter(week => week.contacted > 0),
            week => week.contactedAdvanced.pct,
            'доля разговоров с ЛПР, закончившихся шагом вперёд,',
        ),
    ].filter((part): part is string => part !== null);
    if (parts.length === 0) return null;
    return `Динамика внутри периода: ${parts.join('; ')}.`;
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
    // Разные условия разным клиентам — не проблема и не вывод (решение
    // владельца 09.11.2026): цены в резюме только справочно.
    if (spread) {
        return `Цены в разговорах: за ${countText(spread.periodMonths, ['месяц', 'месяца', 'месяцев'])} звучало от ${moneyText(spread.range.min)} до ${moneyText(spread.range.max)} — условия разным клиентам могут отличаться, это не оценивается.`;
    }
    return `Цены в разговорах: ${countText(prices.n, ['цена', 'цены', 'цен'])}, суммы совпадают.`;
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
    return `Работающее звено — ${TYPE_GROUP_LABELS[best.group].toLowerCase()}: ${pctText(best.advancedOfContacted.pct)} таких разговоров с ЛПР двигают клиента дальше.`;
}
