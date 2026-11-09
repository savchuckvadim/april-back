import { countOutcomes, markedOf } from './owner-report.overview';
import { shareOf } from './owner-report.share';
import type {
    OwnerReportCall,
    OwnerReportFunnel,
    OwnerReportFunnelStage,
    OwnerReportFunnelStageCode,
} from './owner-report.types';

/**
 * Воронка по разговорам (замечание владельца 09.11.2026 по образцу OrbitAI):
 * три ступени — холодный вход, показ, после показа и КП — с исходами на
 * каждой и отдельным признаком «согласие на счёт». Так виден последний
 * этап, где уже вложены холодный звонок и показ, а деньги застревают в
 * «подумаем». Доли — по размеченным исходам, как везде в отчёте.
 */

export const OWNER_REPORT_FUNNEL_STAGES: readonly OwnerReportFunnelStageCode[] =
    ['cold', 'presentation', 'followup'];

/** Следующий шаг «счёт» при шаге вперёд — клиент согласился на счёт. */
const INVOICE_STEP_KIND = 'invoice';

/** Согласие на счёт в разговоре; исход не размечен — null. */
export function invoiceAgreedOf(call: OwnerReportCall): boolean | null {
    if (call.advanced === null) return null;
    return call.advanced && call.nextStepKind === INVOICE_STEP_KIND;
}

function stageOf(
    code: OwnerReportFunnelStageCode,
    calls: readonly OwnerReportCall[],
): OwnerReportFunnelStage {
    const rows = calls.filter(call => call.typeGroup === code);
    const marked = markedOf(rows);
    const byOutcome = countOutcomes(rows);
    const n = marked.length;
    return {
        code,
        calls: rows.length,
        marked: n,
        advanced: shareOf(byOutcome.advanced, n),
        undecided: shareOf(byOutcome.callback_dated + byOutcome.postponed, n),
        refused: shareOf(byOutcome.refused, n),
        noContact: shareOf(byOutcome.no_contact, n),
        invoiceAgreed: shareOf(
            marked.filter(call => invoiceAgreedOf(call) === true).length,
            n,
        ),
    };
}

export function buildFunnel(
    calls: readonly OwnerReportCall[],
): OwnerReportFunnel {
    return {
        stages: OWNER_REPORT_FUNNEL_STAGES.map(code => stageOf(code, calls)),
        invoiceAgreedTotal: markedOf(calls).filter(
            call => invoiceAgreedOf(call) === true,
        ).length,
    };
}
