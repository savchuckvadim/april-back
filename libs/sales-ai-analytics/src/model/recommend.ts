import type { QualityLink } from '../contracts/quality-link.types';
import { newcombeDifference, type GapSample } from './edge-rate';
import {
    adviceAllowed,
    evidenceLevelFor,
    type AiEvidenceLevel,
} from './evidence';
import type {
    BuildLeversInput,
    ChecklistLeverInput,
    LeverCandidate,
    ObjectionLeverInput,
    OutcomeSample,
    PipelineLeverInput,
    QualityLeverInput,
    VolumeLeverInput,
} from './lever.types';
import { probabilityOnCurve } from './quality-curve';

export * from './lever.types';

/**
 * Рычаги и ожидаемый эффект в продажах (план §4.10).
 *
 * `volume` — `c_mk·F̄` на единицу объёма (стоимость — минуты
 * `activity_duration_min`); `quality` — `N_k·(p̂(S + δ) − p̂(S))·Π θ`
 * **только при `betaSource: data`** (стоимость — `coaching_hours_section`);
 * `checklist` — `N_k·(θ|c=1 − θ|c=0)·(1 − share_c)`; `pipeline` —
 * `n_open·(θ_hot − θ_stage)`; `objection` — `n_obj·(θ|handled −
 * θ|unhandled)`, где θ берётся **только из CRM-исхода эпизода**, а метка
 * того же прохода LLM в эффект не входит.
 *
 * Критерий выдачи — нижняя граница 80 %-интервала эффекта > 0
 * (`lever_lb_level`), не более `lever_max = 3` рычагов, у каждого
 * `basis` и `ruleCode`. До сцепки со сделкой `checklist` и `objection` —
 * уровень E0 без ожидаемого эффекта; β гипотезы портала в рычаги
 * не попадает никогда.
 */
export const LEVER_DEFAULTS = {
    /** `lever_max`. */
    max: 3,
    /** `lever_lb_level` — уровень интервала эффекта. */
    lbLevel: 0.8,
    /** Квантиль двустороннего 80 %-интервала (`lever_lb_level`). */
    z80: 1.2816,
    /** `lever_min_section_calls` — минимум разборов раздела. */
    minSectionCalls: 20,
    /** `n_min_none`. */
    minN: 8,
} as const;

const toGapSample = (sample: OutcomeSample): GapSample => ({
    successes: sample.s,
    exposure: sample.n,
});

const rate = (sample: OutcomeSample): number =>
    sample.n > 0 ? sample.s / sample.n : 0;

/** Разность долей с 80 %-интервалом, масштабированная в продажи. */
function scaledDifference(
    better: OutcomeSample,
    worse: OutcomeSample,
    multiplier: number,
): { delta: number; ci80: readonly [number, number] | null } {
    const ci = newcombeDifference(
        toGapSample(better),
        toGapSample(worse),
        LEVER_DEFAULTS.z80,
    );

    return {
        delta: (rate(better) - rate(worse)) * multiplier,
        ci80: ci ? [ci[0] * multiplier, ci[1] * multiplier] : null,
    };
}

/** Общий контекст кандидатов: уровень доказательности и гейт совета. */
interface LeverContext {
    readonly level: AiEvidenceLevel;
    readonly gate?: AiEvidenceLevel;
    readonly minSectionCalls: number;
}

function volumeCandidate(
    input: VolumeLeverInput,
    ctx: LeverContext,
): LeverCandidate {
    const ci = input.salesPerUnitCi80;

    return {
        lever: 'volume',
        ruleCode: 'volume-below-capacity',
        callType: input.callType,
        deltaSales: input.addedUnits * input.salesPerUnit,
        ci80: ci ? [ci[0] * input.addedUnits, ci[1] * input.addedUnits] : null,
        cost: input.addedUnits * input.costMinutes,
        evidence: ctx.level,
        adviceAllowed: adviceAllowed(ctx.level, ctx.gate),
        basis: [
            `+${input.addedUnits} ${input.callType}`,
            `продаж на активность ${input.salesPerUnit}`,
        ],
    };
}

/**
 * Рычаг качества строится только при `betaSource: data`: эффект берётся
 * со шкалы вероятности `p̂(S + δ) − p̂(S)`, а не из наклона β.
 */
function qualityCandidate(
    input: QualityLeverInput,
    link: QualityLink,
    ctx: LeverContext,
): LeverCandidate | null {
    if (
        link.betaSource !== 'data' ||
        !link.applied ||
        input.sectionCalls < ctx.minSectionCalls
    ) {
        return null;
    }
    const now = probabilityOnCurve(link.curve, input.score);
    const next = probabilityOnCurve(link.curve, input.score + input.delta);
    if (now === null || next === null) {
        return null;
    }
    const delta = (next - now) * input.volume * input.downstream;
    const spread = Math.min(1, Math.max(0, input.relativeSpread ?? 0.5));

    return {
        lever: 'quality',
        ruleCode: 'quality-weak-section',
        section: input.section,
        callType: input.callType,
        deltaSales: delta,
        ci80: [delta * (1 - spread), delta * (1 + spread)],
        cost: input.coachingHours,
        evidence: ctx.level,
        adviceAllowed: adviceAllowed(ctx.level, ctx.gate),
        basis: [
            `S=${input.score} → ${input.score + input.delta}`,
            `разборов ${input.sectionCalls}`,
        ],
    };
}

function checklistCandidate(
    item: ChecklistLeverInput,
    chainLinked: boolean,
    ctx: LeverContext,
): LeverCandidate {
    const multiplier =
        item.episodes *
        Math.min(1, Math.max(0, 1 - item.shareDone)) *
        (item.downstream ?? 1);
    const effect = scaledDifference(
        item.withItem,
        item.withoutItem,
        multiplier,
    );

    return {
        lever: 'checklist',
        ruleCode: 'checklist-item-missing',
        section: item.code,
        deltaSales: chainLinked ? effect.delta : null,
        ci80: chainLinked ? effect.ci80 : null,
        cost: item.costHours ?? 0,
        evidence: chainLinked ? ctx.level : 'E0',
        adviceAllowed: chainLinked ? adviceAllowed(ctx.level, ctx.gate) : false,
        basis: [
            `${item.code}: ${item.withItem.s}/${item.withItem.n} против ${item.withoutItem.s}/${item.withoutItem.n}`,
            chainLinked ? 'сцепка со сделкой есть' : 'до сцепки со сделкой',
        ],
    };
}

function pipelineCandidate(
    input: PipelineLeverInput,
    ctx: LeverContext,
): LeverCandidate {
    const effect = scaledDifference(input.hot, input.stage, input.openDeals);

    return {
        lever: 'pipeline',
        ruleCode: 'pipeline-stuck-deals',
        deltaSales: effect.delta,
        ci80: effect.ci80,
        cost: input.costHours ?? 0,
        evidence: ctx.level,
        adviceAllowed: adviceAllowed(ctx.level, ctx.gate),
        basis: [`открытых сделок ${input.openDeals}`],
    };
}

/**
 * Рычаг возражений: θ берётся из CRM-исхода эпизода. Поле `llmLabel`
 * (метка того же прохода LLM) в расчёт эффекта не входит — иначе
 * «обработано» и «исход» приходили бы из одного источника.
 */
function objectionCandidate(
    item: ObjectionLeverInput,
    chainLinked: boolean,
    ctx: LeverContext,
): LeverCandidate {
    const multiplier = item.episodes * (item.downstream ?? 1);
    const effect = scaledDifference(
        item.crm.handled,
        item.crm.unhandled,
        multiplier,
    );

    return {
        lever: 'objection',
        ruleCode: 'objection-worst-outcome',
        category: item.category,
        deltaSales: chainLinked ? effect.delta : null,
        ci80: chainLinked ? effect.ci80 : null,
        cost: item.costHours ?? 0,
        evidence: chainLinked ? ctx.level : 'E0',
        adviceAllowed: chainLinked ? adviceAllowed(ctx.level, ctx.gate) : false,
        basis: [
            `${item.category}: исход из CRM-эпизода`,
            `обработано ${item.crm.handled.s}/${item.crm.handled.n}`,
        ],
    };
}

/** Рычаг с числом проходит только при нижней границе интервала > 0. */
function passesLowerBound(candidate: LeverCandidate): boolean {
    if (candidate.deltaSales === null) {
        return true;
    }

    return candidate.ci80 !== null && candidate.ci80[0] > 0;
}

function compareCandidates(a: LeverCandidate, b: LeverCandidate): number {
    const left = a.deltaSales ?? Number.NEGATIVE_INFINITY;
    const right = b.deltaSales ?? Number.NEGATIVE_INFINITY;
    if (right !== left) {
        return right - left;
    }
    if (a.cost !== b.cost) {
        return a.cost - b.cost;
    }

    return a.ruleCode.localeCompare(b.ruleCode);
}

function collectCandidates(
    input: BuildLeversInput,
    ctx: LeverContext,
): LeverCandidate[] {
    const candidates: LeverCandidate[] = [];
    if (input.volume) {
        candidates.push(volumeCandidate(input.volume, ctx));
    }
    if (input.quality) {
        const candidate = qualityCandidate(input.quality, input.link, ctx);
        if (candidate) {
            candidates.push(candidate);
        }
    }
    for (const item of input.checklist ?? []) {
        candidates.push(checklistCandidate(item, input.chainLinked, ctx));
    }
    if (input.pipeline) {
        candidates.push(pipelineCandidate(input.pipeline, ctx));
    }
    for (const item of input.objections ?? []) {
        candidates.push(objectionCandidate(item, input.chainLinked, ctx));
    }

    return candidates;
}

/**
 * Топ рычагов: критерий — нижняя граница 80 %-интервала эффекта > 0,
 * не более `lever_max` штук, каждый с `basis` и `ruleCode`.
 * Рычаг качества в режимах `none` и `hypothesis` не выдаётся вовсе.
 */
export function buildLevers(input: BuildLeversInput): LeverCandidate[] {
    const evidence = input.evidence ?? { n: 0, hasInterval: false };
    const ctx: LeverContext = {
        level: evidenceLevelFor({
            ...evidence,
            minN: input.minN ?? evidence.minN ?? LEVER_DEFAULTS.minN,
        }),
        gate: input.gate,
        minSectionCalls:
            input.minSectionCalls ?? LEVER_DEFAULTS.minSectionCalls,
    };

    return collectCandidates(input, ctx)
        .filter(passesLowerBound)
        .sort(compareCandidates)
        .slice(0, Math.max(0, input.max ?? LEVER_DEFAULTS.max));
}
