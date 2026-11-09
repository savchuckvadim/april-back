import { ruDecimal } from '../../ru-text.util';
import type {
    OwnerReportFacts,
    OwnerReportPresentationManagerRow,
} from '../owner-report.types';
import {
    countText,
    pctText,
    REPORT_FORMS,
    shareText,
} from './owner-report.format';
import { FUNNEL_STAGE_LABELS, SECTION_LABELS } from './owner-report.labels';
import type {
    OwnerReportCrmFunnelText,
    OwnerReportFunnelText,
    OwnerReportPresentationsText,
} from './owner-report.text.types';

/**
 * Тексты разделов «Воронка и конверсии» и «Презентации» (замечания
 * владельца 09.11.2026 по образцу OrbitAI): цепочка холодный вход → показ →
 * после показа и КП, согласие на счёт, воронка по CRM из KPI-данных и
 * сводка качества показов с парой «под задачи клиента против шаблонного».
 */

const PRESENTATION_FORMS = ['показ', 'показа', 'показов'] as const;
/** «из 4 показов» — родительный падеж. */
const PRESENTATION_GENITIVE = ['показа', 'показов', 'показов'] as const;
/** «по 5 показам» — дательный падеж. */
const PRESENTATION_DATIVE = ['показу', 'показам', 'показам'] as const;
/** «в 3 разговорах» — предложный падеж. */
const CALLS_PREPOSITIONAL = ['разговоре', 'разговорах', 'разговорах'] as const;
const SCORE_MAX = 10;
/** Минимум показов у сотрудника, чтобы называть его в сравнении. */
const PEOPLE_MIN_CALLS = 3;

export function buildFunnelText(
    facts: OwnerReportFacts,
): OwnerReportFunnelText {
    const { funnel } = facts;
    const stage = (code: string) =>
        funnel.stages.find(item => item.code === code) ?? null;
    const cold = stage('cold');
    const presentation = stage('presentation');
    const followup = stage('followup');
    const chainParts: string[] = [];
    if (cold && cold.marked > 0) {
        chainParts.push(
            `из ${countText(cold.marked, ['холодного звонка', 'холодных звонков', 'холодных звонков'])} до показа, доступа или предложения дошли ${cold.advanced.successes} (${pctText(cold.advanced.pct)})`,
        );
    }
    if (presentation && presentation.marked > 0) {
        chainParts.push(
            `из ${countText(presentation.marked, PRESENTATION_GENITIVE)} двигают клиента дальше ${presentation.advanced.successes} (${pctText(presentation.advanced.pct)})`,
        );
    }
    const afterOffer =
        followup && followup.marked > 0
            ? `Из ${countText(followup.marked, REPORT_FORMS.callsGenitive)} после показа и КП ${followup.undecided.successes} (${pctText(followup.undecided.pct)}) закончились переносом или «подумаем»; согласие на счёт — ${followup.invoiceAgreed.successes}.`
            : null;
    return {
        rows: funnel.stages.map(item => ({
            code: item.code,
            label: FUNNEL_STAGE_LABELS[item.code],
            calls: item.calls,
            advanced: shareText(item.advanced),
            undecided: shareText(item.undecided),
            refused: shareText(item.refused),
            noContact: shareText(item.noContact),
            invoiceAgreed: shareText(item.invoiceAgreed),
        })),
        chain:
            chainParts.length > 0 ? `Цепочка: ${chainParts.join('; ')}.` : null,
        afterOffer,
        invoice:
            funnel.invoiceAgreedTotal > 0
                ? `Согласие на счёт прозвучало в ${countText(funnel.invoiceAgreedTotal, CALLS_PREPOSITIONAL)} периода.`
                : 'Согласия на счёт в разговорах периода не зафиксировано ни разу.',
    };
}

interface CrmSums {
    presentations: number;
    invoices: number;
    deals: number;
    known: boolean;
}

function crmSums(facts: OwnerReportFacts): CrmSums {
    const sums: CrmSums = {
        presentations: 0,
        invoices: 0,
        deals: 0,
        known: false,
    };
    for (const row of facts.managers) {
        if (!row.crm) continue;
        sums.known = true;
        sums.presentations += row.crm.presentations;
        sums.invoices += row.crm.invoices;
        sums.deals += row.crm.deals;
    }
    return sums;
}

/** Средняя оценка: «7» или «7,2» — без хвоста «,0». */
const scoreText = (avg: number): string =>
    Number.isInteger(avg) ? String(avg) : ruDecimal(avg, 1);

const ratioText = (numerator: number, denominator: number): string =>
    pctText(denominator > 0 ? (numerator / denominator) * 100 : null);

/** Воронка по CRM из KPI-данных: показы → счета → договоры; без CRM — null. */
export function buildCrmFunnelText(
    facts: OwnerReportFacts,
    previous: OwnerReportFacts | null,
): OwnerReportCrmFunnelText | null {
    const current = crmSums(facts);
    if (!current.known) return null;
    const prev = previous ? crmSums(previous) : null;
    const previousOf = (key: keyof Omit<CrmSums, 'known'>): number | null =>
        prev && prev.known ? prev[key] : null;
    return {
        rows: [
            {
                label: 'Показы по CRM',
                value: current.presentations,
                previous: previousOf('presentations'),
            },
            {
                label: 'Счета',
                value: current.invoices,
                previous: previousOf('invoices'),
            },
            {
                label: 'Договоры',
                value: current.deals,
                previous: previousOf('deals'),
            },
        ],
        conversions: `Счета к показам — ${ratioText(current.invoices, current.presentations)}, договоры к счетам — ${ratioText(current.deals, current.invoices)}, договоры к показам — ${ratioText(current.deals, current.presentations)}.`,
        note: 'Отношения событий за период по данным CRM, а не путь одного клиента: показ и договор могут относиться к разным клиентам.',
    };
}

function peopleLine(
    rows: readonly OwnerReportPresentationManagerRow[],
    names: Readonly<Record<string, string>>,
): string | null {
    const enough = rows
        .filter(row => row.calls >= PEOPLE_MIN_CALLS && row.advanced.n > 0)
        .sort((a, b) => (b.advanced.pct ?? 0) - (a.advanced.pct ?? 0));
    const nameOf = (row: OwnerReportPresentationManagerRow) =>
        names[row.managerId] ?? `Сотрудник ${row.managerId}`;
    if (enough.length === 0) return null;
    // Имена без склонения: «— Надежда: …», а не «у Надежда».
    const best = enough[0];
    if (enough.length === 1) {
        return `Больше всего показов — ${nameOf(best)}: шаг вперёд ${shareText(best.advanced)}.`;
    }
    const worst = enough[enough.length - 1];
    return `Чаще всего показ двигает клиента дальше — ${nameOf(best)}: ${shareText(best.advanced)}; реже всего — ${nameOf(worst)}: ${shareText(worst.advanced)}.`;
}

export function buildPresentationsText(
    facts: OwnerReportFacts,
    names: Readonly<Record<string, string>>,
): OwnerReportPresentationsText {
    const p = facts.presentations;
    if (p.calls === 0) {
        return {
            intro: 'Показов системы в разговорах периода не было.',
            rows: [],
            comparison: null,
            sections: [],
            people: null,
        };
    }
    const comparison =
        p.advancedByNeeds.n > 0 && p.advancedTemplate.n > 0
            ? `Показ под задачи клиента двигает разговор дальше в ${pctText(p.advancedByNeeds.pct)} случаев против ${pctText(p.advancedTemplate.pct)} при шаблонной подаче (${countText(p.advancedByNeeds.n, PRESENTATION_FORMS)} и ${countText(p.advancedTemplate.n, PRESENTATION_FORMS)}).`
            : null;
    return {
        intro: `Показов за период — ${p.calls}; шаг вперёд после показа — ${shareText(p.advanced)}.`,
        rows: [
            {
                label: 'Выявлены задачи клиента',
                value: shareText(p.needsFound),
            },
            { label: 'Показ под задачи клиента', value: shareText(p.byNeeds) },
            { label: 'Попытка закрытия', value: shareText(p.closingAttempted) },
            {
                label: 'Следующий шаг с датой',
                value: shareText(p.nextStepDated),
            },
            {
                label: 'Возражения отработаны',
                value: shareText(p.objectionsHandled),
            },
        ],
        comparison,
        sections: p.sectionScores.map(row => ({
            label: SECTION_LABELS[row.section] ?? row.section,
            value: `${scoreText(row.avg)} из ${SCORE_MAX} (по ${countText(row.n, PRESENTATION_DATIVE)})`,
        })),
        people: peopleLine(p.byManager, names),
    };
}
