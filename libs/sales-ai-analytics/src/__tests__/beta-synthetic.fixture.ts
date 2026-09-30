import { assembleBetaSample } from '../model/beta-sample';
import type {
    AiBetaLeadKind,
    BetaSample,
    BetaSampleSeed,
} from '../model/beta-sample.types';
import { mulberry32, sampleNormal, seedOf } from '../model/prng';

/**
 * Синтетика для спек оценки β (план §4.4, §4.11 «симуляционные тесты»):
 * менеджеры с известными средними качества и случайными эффектами,
 * исход по модели Мундлака с известными α, β_w, β_b, γ, σ_u. Случайность —
 * только через seedOf/mulberry32; время — фиксированная сетка часов.
 */
export interface SyntheticBetaParams {
    readonly managers: number;
    readonly perManager: number;
    readonly betaWithin: number;
    readonly betaBetween: number;
    readonly gamma: number;
    readonly sigmaU: number;
    /** Свободные члены страт (логит). */
    readonly alpha: Readonly<Record<AiBetaLeadKind, number>>;
    readonly strata: readonly AiBetaLeadKind[];
    readonly seed: number;
    /** Разброс средних менеджеров и шум качества внутри менеджера. */
    readonly managerSd?: number;
    readonly noiseSd?: number;
    /**
     * Лид плацебо: независимый шум, «протечка» исхода либо стойкий навык
     * (среднее менеджера + шум — как настоящий `S̄_{m,w+k}`).
     */
    readonly lead?: 'none' | 'independent' | 'leaky' | 'persistent';
}

export interface SyntheticBetaTruth {
    readonly managerMeans: readonly number[];
    readonly managerEffects: readonly number[];
    readonly portalMean: number;
}

/** Часы ISO по сетке: строки с разными неделями и месяцами. */
const HOUR_MS = 3_600_000;
const EPOCH = Date.parse('2026-01-05T09:00:00.000Z');

const clampScore = (value: number): number => Math.min(10, Math.max(1, value));

export const expit = (x: number): number => 1 / (1 + Math.exp(-x));

export const isoAtHour = (hour: number): string =>
    new Date(EPOCH + hour * HOUR_MS).toISOString();

/** Выборка с известными параметрами; `truth` — для проверок восстановления. */
export function syntheticBetaSample(params: SyntheticBetaParams): {
    readonly sample: BetaSample;
    readonly truth: SyntheticBetaTruth;
} {
    const random = mulberry32(seedOf('beta-synthetic', params.seed));
    const managerSd = params.managerSd ?? 0.8;
    const noiseSd = params.noiseSd ?? 1.2;
    const managerMeans: number[] = [];
    const managerEffects: number[] = [];
    for (let m = 0; m < params.managers; m += 1) {
        managerMeans.push(6.5 + managerSd * sampleNormal(random));
        managerEffects.push(params.sigmaU * sampleNormal(random));
    }
    const portalMean =
        managerMeans.reduce((acc, value) => acc + value, 0) /
        managerMeans.length;
    const seeds: BetaSampleSeed[] = [];
    let hour = 0;
    for (let m = 0; m < params.managers; m += 1) {
        const managerId = `m${String(m + 1).padStart(2, '0')}`;
        for (let i = 0; i < params.perManager; i += 1) {
            hour += 1;
            const score = clampScore(
                managerMeans[m] + noiseSd * sampleNormal(random),
            );
            const calls = Math.floor(random() * 4);
            const stratum =
                params.strata[Math.floor(random() * params.strata.length)];
            const eta =
                params.alpha[stratum] +
                params.betaWithin * (score - managerMeans[m]) +
                params.betaBetween * (managerMeans[m] - portalMean) +
                params.gamma * Math.log(1 + calls) +
                managerEffects[m];
            const outcome: 0 | 1 = random() < expit(eta) ? 1 : 0;
            const at = isoAtHour(hour);
            const lead =
                params.lead === 'independent'
                    ? 6.5 + sampleNormal(random)
                    : params.lead === 'leaky'
                      ? 6 + outcome + sampleNormal(random)
                      : params.lead === 'persistent'
                        ? managerMeans[m] + 0.3 * sampleNormal(random)
                        : null;
            seeds.push({
                callId: `c${String(hour).padStart(5, '0')}`,
                managerId,
                entityId: `d${hour}`,
                episodeKey: `d${hour}#0`,
                at,
                monthKey: at.slice(0, 7),
                stratum,
                score,
                scoreSource: 'form',
                callsInEpisode: calls,
                offset: 0,
                outcome,
                daysToOutcome: outcome === 1 ? 5 : null,
                sBarLead: lead,
            });
        }
    }

    return {
        sample: assembleBetaSample(seeds),
        truth: { managerMeans, managerEffects, portalMean },
    };
}

/**
 * Типовой дизайн плана: 15 менеджеров по 200 презентаций, три страты.
 * β_w ≠ β_b — эстиманд pooled здесь смесь, поэтому покрытие pooled
 * проверяется на `EQUAL_BETA_SYNTHETIC`.
 */
export const DEFAULT_SYNTHETIC: SyntheticBetaParams = {
    managers: 15,
    perManager: 200,
    betaWithin: 0.25,
    betaBetween: 0.15,
    gamma: -0.2,
    sigmaU: 0.5,
    alpha: { cold: -0.8, request: -0.3, lead: -0.5 },
    strata: ['cold', 'request', 'lead'],
    seed: 1,
};

/** Тот же дизайн с β_w = β_b: истина одна для within, between и pooled. */
export const EQUAL_BETA_SYNTHETIC: SyntheticBetaParams = {
    ...DEFAULT_SYNTHETIC,
    betaBetween: DEFAULT_SYNTHETIC.betaWithin,
    seed: 2,
};
