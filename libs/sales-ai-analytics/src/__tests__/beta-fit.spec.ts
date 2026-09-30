import {
    BETA_FIT_DEFAULTS,
    type BetaEstimate,
    fitBeta,
} from '../model/beta-fit';
import { assembleBetaSample } from '../model/beta-sample';
import type { BetaSampleSeed } from '../model/beta-sample.types';
import { mulberry32, sampleNormal, seedOf } from '../model/prng';
import { spearmanBrown } from '../model/reliability';
import { registryDefault } from '../params/registry.access';
import {
    DEFAULT_SYNTHETIC,
    EQUAL_BETA_SYNTHETIC,
    expit,
    isoAtHour,
    syntheticBetaSample,
} from './beta-synthetic.fixture';

const covers = (estimate: BetaEstimate | null, truth: number): boolean =>
    estimate !== null && estimate.ci90[0] <= truth && estimate.ci90[1] >= truth;

const REPLICAS = 25;
const MIN_COVERAGE = 0.8;

describe('fitBeta — восстановление β на синтетике (план §4.4, §4.11)', () => {
    const { sample } = syntheticBetaSample(DEFAULT_SYNTHETIC);
    const fit = fitBeta(sample, { designEffect: 1 });

    it('дефолты — из реестра', () => {
        expect(BETA_FIT_DEFAULTS.managerEffectSd).toBe(
            registryDefault('beta_manager_effect_sd'),
        );
        expect(BETA_FIT_DEFAULTS.minEpv).toBe(registryDefault('beta_min_epv'));
        expect(BETA_FIT_DEFAULTS.minN).toBe(registryDefault('n_min_none'));
    });

    it('полная форма при 3000 строк, обе спецификации сошлись', () => {
        expect(fit.form).toEqual({ mundlak: 'full', pooled: 'full' });
        expect(fit.converged).toBe(true);
        expect(fit.n).toBe(3000);
        expect(fit.iterations).toBeLessThan(30);
        expect(Object.keys(fit.managerEffects)).toHaveLength(15);
        expect(Object.keys(fit.strataIntercepts)).toEqual([
            'cold',
            'request',
            'lead',
        ]);
    });

    it('|β̂_w − β_w| < 0,1, β_b в интервале, γ и страты рядом с истиной', () => {
        expect(
            Math.abs((fit.within as BetaEstimate).value - 0.25),
        ).toBeLessThan(0.1);
        expect(covers(fit.between, 0.15)).toBe(true);
        expect(Math.abs((fit.gamma as BetaEstimate).value + 0.2)).toBeLessThan(
            0.15,
        );
        expect(fit.strataIntercepts.cold as number).toBeLessThan(
            fit.strataIntercepts.request as number,
        );
    });

    it('β_pooled при β_w ≠ β_b лежит между ними (смесь эстимандов)', () => {
        const pooled = (fit.pooled as BetaEstimate).value;
        expect(pooled).toBeGreaterThan(0.15 - 0.05);
        expect(pooled).toBeLessThan(0.25 + 0.05);
    });

    it('интервалы упорядочены, SE конечны и положительны', () => {
        [fit.within, fit.between, fit.pooled, fit.gamma].forEach(estimate => {
            expect(estimate).not.toBeNull();
            const { se, ci90, value } = estimate as BetaEstimate;
            expect(se).toBeGreaterThan(0);
            expect(ci90[0]).toBeLessThan(value);
            expect(ci90[1]).toBeGreaterThan(value);
        });
    });

    it('случайные эффекты менеджеров усажены к нулю и коррелируют с истиной', () => {
        const { truth } = syntheticBetaSample(DEFAULT_SYNTHETIC);
        const ids = Object.keys(fit.managerEffects).sort((a, b) =>
            a.localeCompare(b),
        );
        let agree = 0;
        ids.forEach((id, index) => {
            if (
                Math.sign(fit.managerEffects[id]) ===
                Math.sign(truth.managerEffects[index])
            ) {
                agree += 1;
            }
            expect(Math.abs(fit.managerEffects[id])).toBeLessThan(2);
        });
        expect(agree).toBeGreaterThanOrEqual(10);
    });

    it('β_w, β_b и β_pooled накрывают истину не менее чем в 80 % из 25 реплик', () => {
        const truth = EQUAL_BETA_SYNTHETIC.betaWithin;
        let coveredWithin = 0;
        let coveredBetween = 0;
        let coveredPooled = 0;
        for (let replica = 1; replica <= REPLICAS; replica += 1) {
            const replicaFit = fitBeta(
                syntheticBetaSample({ ...EQUAL_BETA_SYNTHETIC, seed: replica })
                    .sample,
                { designEffect: 1 },
            );
            coveredWithin += covers(replicaFit.within, truth) ? 1 : 0;
            coveredBetween += covers(replicaFit.between, truth) ? 1 : 0;
            coveredPooled += covers(replicaFit.pooled, truth) ? 1 : 0;
        }
        expect(coveredWithin / REPLICAS).toBeGreaterThanOrEqual(MIN_COVERAGE);
        expect(coveredBetween / REPLICAS).toBeGreaterThanOrEqual(MIN_COVERAGE);
        expect(coveredPooled / REPLICAS).toBeGreaterThanOrEqual(MIN_COVERAGE);
    });

    it('d_eff по умолчанию расширяет интервал в 1/√0,8 раза', () => {
        const conservative = fitBeta(sample);
        expect(conservative.designEffect).toBe(BETA_FIT_DEFAULTS.designEffect);
        expect((conservative.within as BetaEstimate).se).toBeCloseTo(
            (fit.within as BetaEstimate).se / Math.sqrt(0.8),
            10,
        );
    });

    it('без измеренной надёжности поправка скрыта, сырая оценка сохранена', () => {
        expect(fit.reliability.r).toBeNull();
        expect(fit.reliability.rBetween).toBeNull();
        expect(fit.reliability.within?.hidden).toBe(true);
        expect(fit.reliability.within?.betaObserved).toBe(
            (fit.within as BetaEstimate).value,
        );
    });

    it('с надёжностью r: β_w и β_pooled делятся на r, β_b — на Спирмена–Брауна', () => {
        const withR = fitBeta(sample, { designEffect: 1, reliability: 0.7 });
        const rBetween = spearmanBrown(0.7, 200);
        expect(withR.reliability.rowsPerManager).toBe(200);
        expect(withR.reliability.rBetween).toBeCloseTo(rBetween, 12);
        expect(withR.reliability.within?.beta).toBeCloseTo(
            (withR.within as BetaEstimate).value / 0.7,
            12,
        );
        expect(withR.reliability.pooled?.beta).toBeCloseTo(
            (withR.pooled as BetaEstimate).value / 0.7,
            12,
        );
        expect(withR.reliability.between?.beta).toBeCloseTo(
            (withR.between as BetaEstimate).value / rBetween,
            12,
        );
    });

    it('детерминизм: две подгонки равны', () => {
        expect(fitBeta(sample, { designEffect: 1 })).toEqual(fit);
    });
});

/**
 * Восстановление β при известной надёжности предиктора-среднего (план §4.4):
 * предиктор — среднее k зашумлённых измерений истинного качества,
 * поправка `β̂/r_k` со Спирменом–Брауном приближает истину.
 */
describe('fitBeta — поправка на надёжность предиктора-среднего', () => {
    const BETA = 0.3;
    const SIGMA_TRUE = 1.5;
    const SIGMA_ERROR = 1.5;
    const icc = SIGMA_TRUE ** 2 / (SIGMA_TRUE ** 2 + SIGMA_ERROR ** 2);

    const noisySample = (k: number, seed: number) => {
        const random = mulberry32(seedOf('reliability', k, seed));
        const seeds: BetaSampleSeed[] = [];
        for (let i = 1; i <= 6000; i += 1) {
            const truth = 6 + SIGMA_TRUE * sampleNormal(random);
            let observed = 0;
            for (let j = 0; j < k; j += 1) {
                observed += truth + SIGMA_ERROR * sampleNormal(random);
            }
            const outcome: 0 | 1 =
                random() < expit(-0.4 + BETA * (truth - 6)) ? 1 : 0;
            seeds.push({
                callId: `c${String(i).padStart(5, '0')}`,
                managerId: `m${i % 5}`,
                entityId: `d${i}`,
                episodeKey: `d${i}#0`,
                at: isoAtHour(i),
                monthKey: '2026-01',
                stratum: 'request',
                score: observed / k,
                scoreSource: 'form',
                callsInEpisode: 0,
                offset: 0,
                outcome,
                daysToOutcome: null,
                sBarLead: null,
            });
        }

        return assembleBetaSample(seeds);
    };

    it.each([2, 10])('среднее из %i измерений: β̂/r_k ближе к истине', k => {
        const r = spearmanBrown(icc, k);
        const fit = fitBeta(noisySample(k, 7), {
            reliability: r,
            designEffect: 1,
        });
        const raw = (fit.pooled as BetaEstimate).value;
        const corrected = fit.reliability.pooled?.beta as number;
        expect(fit.reliability.r).toBeCloseTo(r, 12);
        // calls_i не меняется по строкам → γ неоцениваем, форма без γ.
        expect(fit.form.pooled).toBe('no-gamma');
        expect(raw).toBeLessThan(BETA);
        expect(Math.abs(corrected - BETA)).toBeLessThan(Math.abs(raw - BETA));
        expect(Math.abs(corrected - BETA)).toBeLessThan(0.06);
    });

    it('при n = 10 сырая оценка ближе к истине, чем при n = 2', () => {
        const two = (
            fitBeta(noisySample(2, 7), { designEffect: 1 })
                .pooled as BetaEstimate
        ).value;
        const ten = (
            fitBeta(noisySample(10, 7), { designEffect: 1 })
                .pooled as BetaEstimate
        ).value;
        expect(Math.abs(ten - BETA)).toBeLessThan(Math.abs(two - BETA));
    });
});
