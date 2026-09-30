import {
    BETA_CALIBRATION_DEFAULTS,
    calibrateBetaFit,
    calibrationBins,
    calibrationSlope,
    placeboLead,
} from '../model/beta-calibration';
import { fitBeta } from '../model/beta-fit';
import { registryDefault } from '../params/registry.access';
import {
    DEFAULT_SYNTHETIC,
    EQUAL_BETA_SYNTHETIC,
    syntheticBetaSample,
} from './beta-synthetic.fixture';

describe('калибровочный контур β (план §4.4 «гейт», §4.11 «проверки»)', () => {
    const { sample } = syntheticBetaSample({
        ...DEFAULT_SYNTHETIC,
        lead: 'independent',
    });
    const fit = fitBeta(sample, { designEffect: 1 });
    const y = sample.rows.map(row => row.outcome);

    it('число корзин — из реестра', () => {
        expect(BETA_CALIBRATION_DEFAULTS.bins).toBe(
            registryDefault('beta_calibration_bins'),
        );
    });

    it('наклон калибровки верной модели ≈ 1, интервал накрывает 1', () => {
        const slope = calibrationSlope(y, fit.models.pooled.eta);
        expect(slope).not.toBeNull();
        expect(Math.abs((slope?.slope as number) - 1)).toBeLessThan(0.2);
        expect(slope?.coversOne).toBe(true);
        expect(slope?.n).toBe(sample.n);
    });

    it('переобученный предиктор (η·2) — наклон заметно меньше 1', () => {
        const slope = calibrationSlope(
            y,
            fit.models.pooled.eta.map(value => value * 2),
        );
        expect(slope?.slope as number).toBeLessThan(0.7);
        expect(slope?.ci90[1] as number).toBeLessThan(1);
        expect(slope?.coversOne).toBe(false);
    });

    it('зашумлённый предиктор — наклон ниже, чем у верного', () => {
        const noisy = fit.models.pooled.eta.map(
            (value, index) => value + ((index * 7919) % 13) / 4 - 1.5,
        );
        const clean = calibrationSlope(y, fit.models.pooled.eta);
        const slope = calibrationSlope(y, noisy);
        expect(slope?.slope as number).toBeLessThan(clean?.slope as number);
    });

    it('мало строк или вырожденный η — наклона нет', () => {
        expect(
            calibrationSlope(y.slice(0, 5), fit.models.pooled.eta.slice(0, 5)),
        ).toBeNull();
        expect(
            calibrationSlope(
                y,
                y.map(() => 0),
            ),
        ).toBeNull();
    });

    it('корзины: 5 по квантилям p̂, доли ∈ [0; 1], интервалы упорядочены', () => {
        const bins = calibrationBins(y, fit.models.pooled.predicted);
        expect(bins).toHaveLength(5);
        expect(bins.reduce((acc, bin) => acc + bin.n, 0)).toBe(sample.n);
        bins.forEach((bin, index) => {
            expect(bin.binIndex).toBe(index);
            expect(bin.observedShare).toBeGreaterThanOrEqual(0);
            expect(bin.observedShare).toBeLessThanOrEqual(1);
            expect(bin.ci90[0]).toBeLessThanOrEqual(bin.observedShare);
            expect(bin.ci90[1]).toBeGreaterThanOrEqual(bin.observedShare);
            if (index > 0) {
                expect(bin.predictedMean).toBeGreaterThanOrEqual(
                    bins[index - 1].predictedMean,
                );
            }
            expect(
                Math.abs(bin.observedShare - bin.predictedMean),
            ).toBeLessThan(0.1);
        });
        expect(calibrationBins([], [])).toEqual([]);
    });

    it('плацебо: независимый лид не предсказывает — интервал накрывает 0', () => {
        const placebo = placeboLead(sample);
        expect(placebo).not.toBeNull();
        expect(placebo?.passed).toBe(true);
        expect(placebo?.n).toBe(sample.n);
        expect(placebo?.current.value as number).toBeGreaterThan(0.1);
    });

    it('плацебо: стойкий навык (лид ≈ S̄_m) при β_w = β_b не предсказывает сверх S_i', () => {
        const persistent = syntheticBetaSample({
            ...EQUAL_BETA_SYNTHETIC,
            lead: 'persistent',
        }).sample;
        const placebo = placeboLead(persistent, { designEffect: 1 });
        expect(placebo?.passed).toBe(true);
        expect(placebo?.form).toBe('full');
        expect(placebo?.current.value as number).toBeGreaterThan(0.1);
        // Лид — величина уровня менеджера: SE при u_m много шире наивной.
        expect(placebo?.lead.se as number).toBeGreaterThan(
            (placebo?.current.se as number) * 2,
        );
    });

    it('плацебо: «протекающий» лид предсказывает — проверка провалена', () => {
        const leaky = syntheticBetaSample({
            ...DEFAULT_SYNTHETIC,
            lead: 'leaky',
        }).sample;
        expect(placeboLead(leaky)?.passed).toBe(false);
    });

    it('без лида плацебо не считается (null — ни pass, ни fail)', () => {
        const noLead = syntheticBetaSample(DEFAULT_SYNTHETIC).sample;
        expect(placeboLead(noLead)).toBeNull();
        expect(calibrateBetaFit(noLead, fitBeta(noLead)).placebo).toBeNull();
    });

    it('сводка по pooled-модели и пустая сводка при insufficient', () => {
        const calibration = calibrateBetaFit(sample, fit);
        expect(calibration.slope?.coversOne).toBe(true);
        expect(calibration.bins).toHaveLength(5);
        expect(calibration.placebo?.passed).toBe(true);
        const tiny = syntheticBetaSample({
            ...DEFAULT_SYNTHETIC,
            managers: 2,
            perManager: 10,
        });
        const tinyFit = fitBeta(tiny.sample);
        expect(calibrateBetaFit(tiny.sample, tinyFit)).toEqual({
            slope: null,
            bins: [],
            placebo: null,
        });
    });

    it('детерминизм', () => {
        expect(calibrateBetaFit(sample, fit)).toEqual(
            calibrateBetaFit(sample, fit),
        );
    });
});
