import { registryDefault } from '../params/registry.access';
import type {
    AiBetaSource,
    QualityLink,
    QualityLinkReason,
    QualityMultiplier,
    QualityPoint,
} from '../contracts/quality-link.types';
import {
    normalizeCurve,
    probabilityOnCurve,
    scoreForProbability,
} from './quality-curve';

/**
 * Связь «качество → исход» и шкала её применения (план §4.4, §4.8, §4.9).
 *
 * Всё прикладное считается на **шкале вероятности**: множитель
 * `r(S) = p̂(S)/p̂(S_ref)`, изо-линия `N·p̂(S) = const`, обратная задача
 * `S_req = p̂⁻¹(p̂(S_ref)·N_req/(cap·D_rem))`. Экспонента `exp(β·ΔS)`
 * допустима только для редкого исхода и помечается `rareOutcomeOnly`.
 *
 * В режимах `none` и `hypothesis` множитель равен 1 и `applied: false`:
 * план дня, рычаги и советы от качества не зависят, изо-линия недоступна.
 */
export const QAV_DEFAULTS = {
    /** `s_ref` — fallback медианы полосы 6–18 мес. */
    sRef: registryDefault('s_ref'),
    /** `s_req_max` — выше требуемое качество считается недостижимым. */
    sReqMax: registryDefault('s_req_max'),
    /** Не параметр реестра: нижняя граница шкалы оценки звонка 1–10. */
    sMin: 1,
    /** Не параметр реестра: верхняя граница шкалы оценки звонка 1–10. */
    sMax: 10,
} as const;

/** Вход построения связи. */
export interface QualityLinkInput {
    readonly betaSource: AiBetaSource;
    /** `s_ref`; вне [1; 10] — дефолт 7. */
    readonly sRef?: number;
    /** Табличная `p̂(S)` из оценки Фазы 4; используется только при `data`. */
    readonly curve?: readonly QualityPoint[];
    /** Наклон логита — для подписи и для редкого исхода. */
    readonly beta?: number | null;
    /** Исход редкий (продажа): разрешена экспонента вместо кривой. */
    readonly rareOutcome?: boolean;
    /** β гипотезы портала — только калькулятор «что если». */
    readonly hypothesisBeta?: number | null;
}

/** Результат обратной задачи «какое качество нужно». */
export interface RequiredQualityResult {
    /** `S_req`; null — связи нет либо цель недостижима. */
    readonly sReq: number | null;
    /** Цель недостижима качеством при `S ≤ s_req_max`. */
    readonly unreachable: boolean;
    /** Причина отсутствия числа. */
    readonly reason: 'no-link' | 'no-volume' | 'above-s-req-max' | null;
}

/** `p̂(S)` связи; null — кривой нет (режимы `none` и `hypothesis`). */
export function probabilityAt(link: QualityLink, score: number): number | null {
    return probabilityOnCurve(link.curve, score);
}

function linkReason(
    betaSource: AiBetaSource,
    hasCurve: boolean,
    rareExp: boolean,
): QualityLinkReason | null {
    if (betaSource === 'none') {
        return 'no-beta';
    }
    if (betaSource === 'hypothesis') {
        return 'hypothesis-only';
    }
    if (rareExp) {
        return 'rare-outcome-exp';
    }

    return hasCurve ? null : 'curve-invalid';
}

function resolveSRef(value: number | undefined): number {
    if (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= QAV_DEFAULTS.sMin &&
        value <= QAV_DEFAULTS.sMax
    ) {
        return value;
    }

    return QAV_DEFAULTS.sRef;
}

/**
 * Построение связи. В режимах `none`/`hypothesis` кривая и β связи
 * обнуляются — так β гипотезы физически не может утечь в рычаги и планы.
 */
export function buildQualityLink(input: QualityLinkInput): QualityLink {
    const sRef = resolveSRef(input.sRef);
    const isData = input.betaSource === 'data';
    const curve = isData ? normalizeCurve(input.curve) : [];
    const beta =
        isData && typeof input.beta === 'number' && Number.isFinite(input.beta)
            ? input.beta
            : null;
    const rareExp = isData && curve.length === 0 && Boolean(input.rareOutcome);
    const hypothesisBeta =
        input.betaSource === 'hypothesis' &&
        typeof input.hypothesisBeta === 'number' &&
        Number.isFinite(input.hypothesisBeta)
            ? input.hypothesisBeta
            : null;
    const base: QualityLink = {
        betaSource: input.betaSource,
        sRef,
        curve,
        pRef: null,
        beta,
        hypothesisBeta,
        rareOutcomeOnly: rareExp && beta !== null,
        applied: false,
        reason: linkReason(input.betaSource, curve.length > 0, rareExp),
    };
    if (curve.length > 0) {
        return {
            ...base,
            pRef: probabilityOnCurve(curve, sRef),
            applied: true,
        };
    }

    return base.rareOutcomeOnly ? { ...base, applied: true } : base;
}

/** Нейтральный множитель режимов `none` и `hypothesis`. */
const NEUTRAL_MULTIPLIER: QualityMultiplier = {
    value: 1,
    applied: false,
    scale: 'probability',
    pAtScore: null,
    pAtRef: null,
    rareOutcomeOnly: false,
};

/**
 * Множитель качества `r(S) = p̂(S)/p̂(S_ref)` (план §4.4). В режимах
 * `none` и `hypothesis` — ровно 1 с `applied: false`. Экспонента
 * `exp(β·(S − S_ref))` возвращается только для редкого исхода и всегда
 * с флагом `rareOutcomeOnly`.
 */
export function qualityMultiplier(
    link: QualityLink,
    score: number,
): QualityMultiplier {
    if (!link.applied || !Number.isFinite(score)) {
        return NEUTRAL_MULTIPLIER;
    }
    if (link.rareOutcomeOnly && link.beta !== null) {
        return {
            value: Math.exp(link.beta * (score - link.sRef)),
            applied: true,
            scale: 'exp-beta',
            pAtScore: null,
            pAtRef: null,
            rareOutcomeOnly: true,
        };
    }
    const pAtScore = probabilityOnCurve(link.curve, score);
    const pAtRef = link.pRef;
    if (pAtScore === null || pAtRef === null || pAtRef <= 0) {
        return NEUTRAL_MULTIPLIER;
    }

    return {
        value: pAtScore / pAtRef,
        applied: true,
        scale: 'probability',
        pAtScore,
        pAtRef,
        rareOutcomeOnly: false,
    };
}

/**
 * Изо-линия `N·p̂(S) = const`: сколько активностей нужно при качестве S,
 * чтобы получить то же число исходов. Вне режима `data` возвращает
 * функцию, всегда отдающую null — изо-линия недоступна.
 */
export function isoLine(
    link: QualityLink,
    constantOutcome: number,
): (score: number) => number | null {
    if (!link.applied || link.curve.length === 0) {
        return () => null;
    }

    return (score: number) => {
        const p = probabilityOnCurve(link.curve, score);
        if (p === null || p <= 0 || !Number.isFinite(constantOutcome)) {
            return null;
        }

        return constantOutcome / p;
    };
}

/**
 * Обратная задача плана дня (§4.9): какое качество нужно, чтобы при
 * объёме `volume` получить `target` исходов. Вне режима `data` числа нет.
 */
export function requiredQualityFor(
    link: QualityLink,
    volume: number,
    target: number,
    sReqMax: number = QAV_DEFAULTS.sReqMax,
): RequiredQualityResult {
    if (!link.applied || link.curve.length === 0) {
        return { sReq: null, unreachable: false, reason: 'no-link' };
    }
    if (!Number.isFinite(volume) || volume <= 0 || !Number.isFinite(target)) {
        return { sReq: null, unreachable: true, reason: 'no-volume' };
    }
    const needed = target / volume;
    if (needed >= 1) {
        return { sReq: null, unreachable: true, reason: 'above-s-req-max' };
    }
    const sReq = scoreForProbability(link.curve, needed);
    if (sReq === null || sReq > sReqMax) {
        return { sReq: null, unreachable: true, reason: 'above-s-req-max' };
    }

    return { sReq, unreachable: false, reason: null };
}

/**
 * Шкала применения к плану (§4.9): в режиме `data` знаменатель обратной
 * задачи умножается на `r(Ŝ)`, то есть требуемый объём делится на него;
 * в `none` и `hypothesis` объём остаётся ровно тем же.
 */
export function requiredVolumeWithQuality(
    link: QualityLink,
    baseVolume: number,
    score: number,
): { volume: number; applied: boolean; multiplier: number } {
    const multiplier = qualityMultiplier(link, score);
    if (!multiplier.applied || multiplier.value <= 0) {
        return { volume: baseVolume, applied: false, multiplier: 1 };
    }

    return {
        volume: baseVolume / multiplier.value,
        applied: true,
        multiplier: multiplier.value,
    };
}
