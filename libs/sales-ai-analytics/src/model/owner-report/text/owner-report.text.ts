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
    PERIOD_KIND_LABELS,
    SIGN_LABELS,
    SIGN_VERDICT_LABELS,
    TOPIC_LABELS,
} from './owner-report.labels';
import { OWNER_REPORT_GLOSSARY } from './owner-report.glossary';
import { buildOwnerReportAttention } from './owner-report.attention';
import {
    buildOverview,
    buildTiles,
    unmarkedNoteOf,
} from './owner-report.text.overview';
import {
    buildCrmFunnelText,
    buildFunnelText,
    buildPresentationsText,
} from './owner-report.text.funnel';
import { buildManagerTexts } from './owner-report.text.managers';
import { buildSummaryParagraphs } from './owner-report.text.summary';
import type {
    OwnerReportLeakText,
    OwnerReportManagementText,
    OwnerReportText,
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
        attention: buildOwnerReportAttention(facts),
        summary: buildSummaryParagraphs(facts),
        summarySource: 'template',
        overview: buildOverview(facts),
        funnel: buildFunnelText(facts),
        crmFunnel: buildCrmFunnelText(facts, previous),
        presentations: buildPresentationsText(facts, options.names ?? {}),
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
        glossary: OWNER_REPORT_GLOSSARY.map(item => ({ ...item })),
    };
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
    if (sign.verdict === 'unknown') {
        return sign.code === 'plan_fact'
            ? 'план продаж в CRM не задан'
            : 'в разборах периода не встречалось или не размечено';
    }
    const words = label[sign.verdict];
    if (sign.value === null) return words;
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
    const intro =
        objections.callsWithObjections.n === 0
            ? 'Разговоров с ЛПР, где звучали возражения, в периоде нет.'
            : `Возражения прозвучали в ${shareOfText(objections.callsWithObjections, REPORT_FORMS.callsGenitive)} с ЛПР (${pctText(objections.callsWithObjections.pct)}); отработано ${pctText(objections.handled.pct)} возражений.` +
              (objections.topicUnmarked > 0
                  ? ` Тема не размечена у ${countText(objections.topicUnmarked, REPORT_FORMS.objectionsGenitive)} — это старые разборы, в таблицу тем они не входят.`
                  : '');
    return {
        intro,
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
                ? 'Сбои не по вине разговора размечаются в новой версии разбора; в разборах этого периода разметки нет.'
                : issues.callsWithIssues.successes === 0
                  ? `Сбои не по вине разговора не отмечались: проверено ${countText(issues.callsWithIssues.n, REPORT_FORMS.calls)}.`
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
    const unmarkedLine = unmarkedNoteOf(facts);
    if (unmarkedLine) {
        lines.push(
            `${unmarkedLine} Неразмеченное не считается ни «да», ни «нет»: в таблицах это прочерк.`,
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
