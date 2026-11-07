import { CRM_ISSUE_CODES } from './owner-report.objections';
import { buildTypeGroups, postponedWithDate } from './owner-report.overview';
import { shareOf, shareWhere } from './owner-report.share';
import type {
    OwnerReportCall,
    OwnerReportControlMetric,
    OwnerReportCrmFacts,
    OwnerReportManagement,
    OwnerReportPrices,
    OwnerReportSign,
    OwnerReportSignVerdict,
    OwnerReportWeek,
    OwnerShare,
} from './owner-report.types';

/**
 * «Как управляется отдел»: признаки с порогами и общий вердикт; «Пять
 * метрик для контроля». Пороги — в процентах доли, кроме разброса цен
 * (отношение max/min). Признак без данных — unknown, он не входит в вердикт.
 */

/** Пороги «да / частично» по доле, %. */
const SIGN_THRESHOLDS = {
    repeatability: { yes: 50, partial: 30 },
    stage_control: { yes: 50, partial: 30 },
    needs_discovery: { yes: 50, partial: 30 },
    upsell: { yes: 20, partial: 10 },
    objections_handling: { yes: 60, partial: 40 },
} as const;

/** Зависимость от людей: доля лучшего в продвижениях, выше — хуже. */
const PEOPLE_DEPENDENCY = { yes: 35, partial: 50 } as const;
/** Качество базы: доля звонков со сбоями CRM, выше — хуже. */
const BASE_QUALITY = { yes: 3, partial: 8 } as const;
/** Единые цены: max/min обычной цены в месяц, выше — хуже. */
const PRICE_SPREAD = { yes: 1.2, partial: 1.6 } as const;
/** План-факт: факт/план. */
const PLAN_FACT = { yes: 1, partial: 0.8 } as const;

const NOT_MANAGED_NO_SIGNS = 3;

export interface ManagementInput {
    calls: readonly OwnerReportCall[];
    prices: OwnerReportPrices;
    crm: OwnerReportCrmFacts | null;
    /** Есть ли разборы с фактами focus-v3.1 (иначе сбои и допродажа — unknown). */
    factsAvailable: boolean;
}

const higherIsBetter = (
    value: number | null,
    thresholds: { yes: number; partial: number },
): OwnerReportSignVerdict =>
    value === null
        ? 'unknown'
        : value >= thresholds.yes
          ? 'yes'
          : value >= thresholds.partial
            ? 'partial'
            : 'no';

const lowerIsBetter = (
    value: number | null,
    thresholds: { yes: number; partial: number },
): OwnerReportSignVerdict =>
    value === null
        ? 'unknown'
        : value <= thresholds.yes
          ? 'yes'
          : value <= thresholds.partial
            ? 'partial'
            : 'no';

const signOf = (
    code: string,
    share: OwnerShare,
    verdict: OwnerReportSignVerdict,
): OwnerReportSign => ({ code, verdict, value: share.pct, n: share.n });

/** Доля лучшего менеджера в продвижениях отдела. */
export function topManagerAdvancedShare(
    calls: readonly OwnerReportCall[],
): OwnerShare {
    const advanced = calls.filter(call => call.advanced);
    const counts = new Map<string, number>();
    for (const call of advanced) {
        counts.set(call.managerId, (counts.get(call.managerId) ?? 0) + 1);
    }
    return shareOf(Math.max(0, ...counts.values()), advanced.length);
}

export function crmIssuesShare(calls: readonly OwnerReportCall[]): OwnerShare {
    return shareOf(
        calls.filter(call =>
            call.issues.some(code => CRM_ISSUE_CODES.has(code)),
        ).length,
        calls.length,
    );
}

export function buildManagement(input: ManagementInput): OwnerReportManagement {
    const { calls, prices, crm, factsAvailable } = input;
    const contacted = calls.filter(call => call.contactReached);
    const presentation = buildTypeGroups(calls).find(
        row => row.group === 'presentation',
    );
    const repeat = presentation?.advancedOfContacted ?? shareOf(0, 0);
    const stage = shareWhere(contacted, call => call.nextStepDated);
    const needs = shareWhere(contacted, call => call.needsFound);
    const upsell = factsAvailable
        ? shareWhere(contacted, call => call.upsellAttempted)
        : shareOf(0, 0);
    const objections = shareWhere(
        contacted.flatMap(call => call.objections),
        objection => objection.handled,
    );
    const top = topManagerAdvancedShare(calls);
    const base = factsAvailable ? crmIssuesShare(calls) : shareOf(0, 0);
    const spread = prices.listPerMonth
        ? prices.listPerMonth.max / prices.listPerMonth.min
        : null;
    const planFact = planFactOf(crm);

    const signs: OwnerReportSign[] = [
        signOf(
            'repeatability',
            repeat,
            higherIsBetter(repeat.pct, SIGN_THRESHOLDS.repeatability),
        ),
        {
            code: 'unified_pricing',
            verdict: lowerIsBetter(spread, PRICE_SPREAD),
            value: spread,
            n: prices.listPerMonth?.n ?? 0,
        },
        signOf(
            'people_dependency',
            top,
            lowerIsBetter(top.pct, PEOPLE_DEPENDENCY),
        ),
        signOf(
            'stage_control',
            stage,
            higherIsBetter(stage.pct, SIGN_THRESHOLDS.stage_control),
        ),
        signOf(
            'needs_discovery',
            needs,
            higherIsBetter(needs.pct, SIGN_THRESHOLDS.needs_discovery),
        ),
        signOf(
            'upsell',
            upsell,
            higherIsBetter(upsell.pct, SIGN_THRESHOLDS.upsell),
        ),
        signOf('base_quality', base, lowerIsBetter(base.pct, BASE_QUALITY)),
        signOf(
            'objections_handling',
            objections,
            higherIsBetter(objections.pct, SIGN_THRESHOLDS.objections_handling),
        ),
        {
            code: 'plan_fact',
            verdict: higherIsBetter(planFact.value, PLAN_FACT),
            value: planFact.value,
            n: planFact.n,
        },
    ];
    return { signs, verdict: verdictOf(signs) };
}

/** Факт/план по менеджерам с планом; без CRM или планов — null. */
function planFactOf(crm: OwnerReportCrmFacts | null): {
    value: number | null;
    n: number;
} {
    if (!crm) return { value: null, n: 0 };
    let plan = 0;
    let fact = 0;
    let n = 0;
    for (const facts of Object.values(crm.byManager)) {
        if (
            facts.plan === null ||
            facts.plan <= 0 ||
            facts.salesAmount === null
        ) {
            continue;
        }
        plan += facts.plan;
        fact += facts.salesAmount;
        n += 1;
    }
    return { value: plan > 0 ? fact / plan : null, n };
}

function verdictOf(
    signs: readonly OwnerReportSign[],
): OwnerReportManagement['verdict'] {
    const known = signs.filter(sign => sign.verdict !== 'unknown');
    if (known.length === 0) return 'partial';
    const no = known.filter(sign => sign.verdict === 'no').length;
    const partial = known.filter(sign => sign.verdict === 'partial').length;
    if (no === 0 && partial <= 1) return 'managed';
    if (no >= NOT_MANAGED_NO_SIGNS || no * 2 >= known.length) {
        return 'not_managed';
    }
    return 'partial';
}

/** Пять метрик для контроля — те же правила на всём периоде и на последней полной неделе. */
export function buildControlMetrics(
    calls: readonly OwnerReportCall[],
    weeks: readonly OwnerReportWeek[],
    factsAvailable: boolean,
): OwnerReportControlMetric[] {
    const lastWeek = [...weeks].reverse().find(week => !week.partial) ?? null;
    const lastWeekCalls = lastWeek
        ? calls.filter(call => call.weekKey === lastWeek.weekKey)
        : null;
    const metric = (
        code: string,
        direction: OwnerReportControlMetric['direction'],
        compute: (rows: readonly OwnerReportCall[]) => OwnerShare,
    ): OwnerReportControlMetric => ({
        code,
        share: compute(calls),
        lastWeek: lastWeekCalls ? compute(lastWeekCalls) : null,
        direction,
    });
    const groupAdvanced =
        (group: OwnerReportCall['typeGroup']) =>
        (rows: readonly OwnerReportCall[]): OwnerShare => {
            const inGroup = rows.filter(call => call.typeGroup === group);
            return shareOf(
                inGroup.filter(call => call.advanced).length,
                inGroup.length,
            );
        };
    return [
        metric('postponed_with_date', 'higher_better', postponedWithDate),
        metric(
            'followup_to_advanced',
            'higher_better',
            groupAdvanced('followup'),
        ),
        metric('cold_to_advanced', 'higher_better', groupAdvanced('cold')),
        ...(factsAvailable
            ? [metric('crm_issues', 'lower_better', crmIssuesShare)]
            : []),
        metric('top_manager_share', 'lower_better', topManagerAdvancedShare),
    ];
}
