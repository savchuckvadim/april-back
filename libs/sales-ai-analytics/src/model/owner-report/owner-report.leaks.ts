import { firstIds, shareOf } from './owner-report.share';
import type {
    OwnerReportCall,
    OwnerReportLeak,
    OwnerReportLeakCode,
    OwnerReportLeakNature,
    OwnerReportPrices,
    OwnerShare,
} from './owner-report.types';

/**
 * «Где теряем продажи»: кандидаты в утечки считаются кодом по правилам,
 * три самых больших по числу задетых звонков попадают в отчёт. У каждой —
 * масштаб (звонки и доля от своего знаменателя), деньги (если считаются) и
 * природа: процесс, навык или оба. Текст делает формулировщик.
 */

export const OWNER_REPORT_LEAKS_LIMIT = 3;
const EXAMPLES_LIMIT = 3;

/** Какая доля задетых звонков положена в оценку денег: каждый десятый. */
export const LEAK_RECOVERABLE_SHARE = 0.1;

interface LeakRule {
    code: OwnerReportLeakCode;
    nature: OwnerReportLeakNature;
    /** Знаменатель масштаба. */
    base: (calls: readonly OwnerReportCall[]) => OwnerReportCall[];
    /** Задетые звонки среди знаменателя. */
    affected: (base: readonly OwnerReportCall[]) => OwnerReportCall[];
    /** Считать ли деньги по оценке сделки. */
    money: boolean;
}

const LEAK_RULES: readonly LeakRule[] = [
    {
        code: 'followup_no_decision',
        nature: 'both',
        base: calls =>
            calls.filter(
                call => call.typeGroup === 'followup' && call.advanced !== null,
            ),
        affected: base => base.filter(call => call.advanced === false),
        money: true,
    },
    {
        code: 'postponed_no_date',
        nature: 'process',
        base: calls =>
            calls.filter(
                call => call.outcome !== null && call.contactReached === true,
            ),
        affected: base => base.filter(call => call.outcome === 'postponed'),
        money: true,
    },
    {
        code: 'cold_no_contact',
        nature: 'process',
        base: calls =>
            calls.filter(
                call =>
                    call.typeGroup === 'cold' && call.contactReached !== null,
            ),
        affected: base => base.filter(call => call.contactReached === false),
        money: false,
    },
    {
        code: 'objections_unhandled',
        nature: 'skill',
        base: calls =>
            calls.filter(
                call =>
                    call.contactReached !== false && call.objections.length > 0,
            ),
        affected: base =>
            base.filter(call =>
                call.objections.some(objection => objection.handled === false),
            ),
        money: false,
    },
    {
        code: 'presentation_without_needs',
        nature: 'skill',
        base: calls => calls.filter(call => call.presentationByNeeds !== null),
        affected: base =>
            base.filter(call => call.presentationByNeeds === false),
        money: false,
    },
];

export function buildLeaks(
    calls: readonly OwnerReportCall[],
    prices: Pick<OwnerReportPrices, 'dealValue'>,
): OwnerReportLeak[] {
    return LEAK_RULES.flatMap(rule => {
        const base = rule.base(calls);
        const affected = rule.affected(base);
        if (affected.length === 0) return [];
        const scale = shareOf(affected.length, base.length);
        return [
            {
                code: rule.code,
                scale,
                money: rule.money ? moneyOf(scale, prices.dealValue) : null,
                nature: rule.nature,
                examples: firstIds(
                    affected.map(call => call.transcriptionId),
                    EXAMPLES_LIMIT,
                ),
            },
        ];
    })
        .sort((a, b) => b.scale.successes - a.scale.successes)
        .slice(0, OWNER_REPORT_LEAKS_LIMIT);
}

/** Деньги утечки: каждый десятый задетый разговор × оценка одной сделки. */
function moneyOf(
    scale: OwnerShare,
    dealValue: OwnerReportPrices['dealValue'],
): OwnerReportLeak['money'] {
    if (!dealValue) return null;
    const deals = Math.max(
        1,
        Math.round(scale.successes * LEAK_RECOVERABLE_SHARE),
    );
    return {
        amount: deals * dealValue.amount,
        basis: dealValue.basis,
        deals,
    };
}
