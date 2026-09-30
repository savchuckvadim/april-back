import {
    AttentionBasis,
    AttentionCandidate,
    AttentionManagerInput,
    AttentionRules,
} from './attention.types';
import { riskTitleOf } from './dictionary-titles.util';
import {
    RU_FORMS,
    ruCount,
    ruDecimal,
    ruInt,
    ruPluralForm,
} from './ru-text.util';

/** Правило сигнала: менеджер + пороги → кандидат или null. */
export type AttentionRule = (
    manager: AttentionManagerInput,
    rules: AttentionRules,
) => AttentionCandidate | null;

const pct = (share: number): string => `${Math.round(share * 100)} %`;

/** «в 2,5 раза», «в 2 раза», «в 5 раз» — кратность словами, без «×». */
function timesText(factor: number): string {
    const rounded = Math.round(factor * 10) / 10;
    return Number.isInteger(rounded)
        ? `в ${ruCount(rounded, RU_FORMS.times)}`
        : `в ${ruDecimal(rounded)} раза`;
}

/**
 * «Закрыватель» (план §4.5): исходы заданы и не ниже норм уровня по всем
 * заданным нормам. Без outcomes или без единой нормы — не закрыватель.
 */
export function isCloser(manager: AttentionManagerInput): boolean {
    const { outcomes, levelNorms } = manager;
    if (!outcomes || !levelNorms) {
        return false;
    }
    const checks: [number, number | undefined][] = [
        [outcomes.invoices, levelNorms.invoices],
        [outcomes.deals, levelNorms.deals],
    ];
    const defined = checks.filter(([, norm]) => norm !== undefined);
    return (
        defined.length > 0 &&
        defined.every(([fact, norm]) => norm === undefined || fact >= norm)
    );
}

/** risk — риск-звонки окна (алерты); тяжесть — их число. */
export const riskRule: AttentionRule = manager => {
    const calls = manager.riskCalls;
    if (calls.length === 0) {
        return null;
    }
    const kinds = [...new Set(calls.map(call => call.kind))]
        .sort()
        .map(riskTitleOf);
    return {
        managerId: manager.managerId,
        signal: 'risk',
        availableFrom: 1,
        severity: -calls.length,
        headline: `Сигналы риска: ${calls.length} (${kinds.join('; ')})`,
        basis: [{ code: 'risk_calls', value: calls.length, n: manager.n }],
        link: {
            managerId: manager.managerId,
            transcriptionIds: calls.map(call => call.transcriptionId).sort(),
        },
    };
};

/** no_data — n < noDataMinN при звонках в телефонии (callsTotal ≠ 0). */
export const noDataRule: AttentionRule = (manager, rules) => {
    const { n, callsTotal } = manager;
    if (n >= rules.noDataMinN || callsTotal === 0) {
        return null;
    }
    const basis: AttentionBasis[] = [
        { code: 'analyzed_calls', value: n, norm: rules.noDataMinN, n },
    ];
    if (callsTotal !== undefined) {
        basis.push({ code: 'calls_total', value: callsTotal, n: callsTotal });
    }
    const suffix = callsTotal === undefined ? '' : ` из ${callsTotal}`;
    const verb = ruPluralForm(n, ['Разобран', 'Разобрано', 'Разобрано']);
    return {
        managerId: manager.managerId,
        signal: 'no_data',
        availableFrom: 1,
        severity: n,
        headline: `${verb} всего ${ruCount(n, RU_FORMS.calls)}${suffix}`,
        basis,
        link: { managerId: manager.managerId },
    };
};

/**
 * discipline — сделано < disciplineMinShare плана CRM при плане ≥
 * disciplineMinPlan (звонки и/или презентации); «закрывателю» не ставится.
 *
 * Заголовок словами, без «CRM» и кодов (правило владельца): «План по
 * звонкам выполнен на 20 % (4 из 20), по презентациям — на 42 % (5 из
 * 12)» — проценты и «сделано из плана» остаются для факт-чека резюме.
 */
export const disciplineRule: AttentionRule = (manager, rules) => {
    if (isCloser(manager)) {
        return null;
    }
    const { discipline } = manager;
    const parts = [
        {
            code: 'call',
            title: 'по звонкам',
            plan: discipline.callPlan,
            done: discipline.callDone,
        },
        {
            code: 'presentation',
            title: 'по презентациям',
            plan: discipline.presentationPlan,
            done: discipline.presentationDone,
        },
    ]
        .filter(
            part =>
                part.plan >= rules.disciplineMinPlan &&
                part.done < rules.disciplineMinShare * part.plan,
        )
        .map(part => ({ ...part, share: part.done / part.plan }));
    if (parts.length === 0) {
        return null;
    }
    const doneOf = (part: (typeof parts)[number]): string =>
        `${pct(part.share)} (${part.done} из ${part.plan})`;
    const [first, ...rest] = parts;
    const headline =
        `План ${first.title} выполнен на ${doneOf(first)}` +
        rest.map(part => `, ${part.title} — на ${doneOf(part)}`).join('');
    return {
        managerId: manager.managerId,
        signal: 'discipline',
        availableFrom: 1,
        severity: Math.min(...parts.map(part => part.share)),
        headline,
        basis: parts.map(part => ({
            code: `${part.code}_plan_done_share`,
            value: part.share,
            norm: rules.disciplineMinShare,
            n: part.plan,
        })),
        link: { managerId: manager.managerId, callType: parts[0].code },
    };
};

/**
 * next_step_drop — n ≥ nextStepMinN в обоих окнах и 90 %-интервалы не
 * пересекаются, причём текущий целиком ниже прошлого (только падение).
 */
export const nextStepDropRule: AttentionRule = (manager, rules) => {
    const { current, previous } = manager.nextStepRate;
    if (
        current.n < rules.nextStepMinN ||
        previous.n < rules.nextStepMinN ||
        current.value === null ||
        previous.value === null ||
        !current.ci90 ||
        !previous.ci90 ||
        current.ci90[1] >= previous.ci90[0]
    ) {
        return null;
    }
    return {
        managerId: manager.managerId,
        signal: 'next_step_drop',
        availableFrom: 1,
        severity: current.value - previous.value,
        headline:
            'Реже договаривается о следующем шаге с датой: ' +
            `было ${pct(previous.value)}, стало ${pct(current.value)}`,
        basis: [
            {
                code: 'next_step_date_rate',
                value: current.value,
                norm: previous.value,
                n: current.n,
                ci90: current.ci90,
            },
            {
                code: 'next_step_date_rate_prev',
                value: previous.value,
                n: previous.n,
                ci90: previous.ci90,
            },
        ],
        link: { managerId: manager.managerId },
    };
};

/**
 * plan_gap — план руководителя отличается от нормы на ≥ planGapRatio.
 *
 * Норма уровня в заголовке названа словами «обычно для такого уровня
 * выходит около N» — без канцелярита «по норме» и кодов слоёв, но смысл
 * сохранён: сравнение идёт с уровнем менеджера, а не со всеми коллегами;
 * числа плана, нормы и кратности остаются для факт-чека резюме.
 */
export const planGapRule: AttentionRule = (manager, rules) => {
    const gap = manager.planGap;
    if (!gap || !(gap.norm > 0) || !Number.isFinite(gap.planHead)) {
        return null;
    }
    const factor = gap.planHead / gap.norm;
    if (Math.abs(factor - 1) < rules.planGapRatio) {
        return null;
    }
    const direction = factor > 1 ? 'выше' : 'ниже';
    const times = timesText(factor > 1 ? factor : 1 / factor);
    return {
        managerId: manager.managerId,
        signal: 'plan_gap',
        availableFrom: 1,
        severity: -Math.abs(factor - 1),
        // Разрыв плана считается по презентациям (ребро «звонок —
        // презентация», см. planGapOf в презентере «Внимания»).
        headline:
            `План руководителя — ${ruCount(ruInt(gap.planHead), RU_FORMS.presentations)}, ` +
            `обычно для такого уровня выходит около ${ruInt(gap.norm)}: план ${direction} ${times}`,
        basis: [
            { code: 'plan_head', value: gap.planHead, norm: gap.norm, n: 0 },
        ],
        link: { managerId: manager.managerId },
    };
};

/** Правила Фазы 1 в порядке приоритета сигналов. */
export const ATTENTION_PHASE1_RULES: readonly AttentionRule[] = [
    riskRule,
    noDataRule,
    disciplineRule,
    nextStepDropRule,
    planGapRule,
];
