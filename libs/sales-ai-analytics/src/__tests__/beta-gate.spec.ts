import {
    AI_BETA_GATE_REASONS,
    BETA_GATE_DEFAULTS,
    betaCountdownFromSample,
    betaDesignFromSample,
    evaluateBetaGate,
} from '../model/beta-gate';
import { BETA_POWER_DEFAULTS, betaGateCountdown } from '../model/beta-power';
import { registryDefault } from '../params/registry.access';
import {
    DEFAULT_SYNTHETIC,
    syntheticBetaSample,
} from './beta-synthetic.fixture';

const passing = {
    se: 0.06,
    calibrationCoversOne: true,
    placeboPassed: true,
    timestampLeakOk: true,
    previousStreak: 0,
};

describe('evaluateBetaGate — гейт β с гистерезисом (план §4.4)', () => {
    it('пороги — из реестра', () => {
        expect(BETA_GATE_DEFAULTS.gateSe).toBe(registryDefault('beta_gate_se'));
        expect(BETA_GATE_DEFAULTS.gateMonths).toBe(
            registryDefault('beta_gate_months'),
        );
        expect(AI_BETA_GATE_REASONS).toContain('se-above-target');
    });

    it('два месяца подряд → published, срыв → серия 0', () => {
        const first = evaluateBetaGate(passing);
        expect(first).toEqual({
            passedNow: true,
            streak: 1,
            published: false,
            reasons: [],
        });
        const second = evaluateBetaGate({
            ...passing,
            previousStreak: first.streak,
        });
        expect(second.streak).toBe(2);
        expect(second.published).toBe(true);
        const third = evaluateBetaGate({
            ...passing,
            se: 0.09,
            previousStreak: second.streak,
        });
        expect(third).toEqual({
            passedNow: false,
            streak: 0,
            published: false,
            reasons: ['se-above-target'],
        });
        const fourth = evaluateBetaGate({
            ...passing,
            previousStreak: third.streak,
        });
        expect(fourth.streak).toBe(1);
        expect(fourth.published).toBe(false);
    });

    it('SE на границе проходит, отсутствие SE — нет', () => {
        expect(
            evaluateBetaGate({ ...passing, se: BETA_GATE_DEFAULTS.gateSe })
                .passedNow,
        ).toBe(true);
        expect(evaluateBetaGate({ ...passing, se: null }).reasons).toEqual([
            'se-missing',
        ]);
    });

    it('плацебо null не блокирует, false — блокирует', () => {
        expect(
            evaluateBetaGate({ ...passing, placeboPassed: null }).passedNow,
        ).toBe(true);
        expect(
            evaluateBetaGate({ ...passing, placeboPassed: false }).reasons,
        ).toEqual(['placebo-failed']);
    });

    it('наклон калибровки: нет — блок, не накрывает 1 — блок', () => {
        expect(
            evaluateBetaGate({ ...passing, calibrationCoversOne: null })
                .reasons,
        ).toEqual(['calibration-missing']);
        expect(
            evaluateBetaGate({ ...passing, calibrationCoversOne: false })
                .reasons,
        ).toEqual(['calibration-not-covering-one']);
    });

    it('протечка меток времени блокирует, причины накапливаются по порядку', () => {
        const result = evaluateBetaGate({
            ...passing,
            se: 0.2,
            calibrationCoversOne: false,
            placeboPassed: false,
            timestampLeakOk: false,
        });
        expect(result.reasons).toEqual([
            'se-above-target',
            'calibration-not-covering-one',
            'placebo-failed',
            'timestamp-leak',
        ]);
    });

    it('число месяцев параметром: при 3 публикации после двух нет', () => {
        expect(
            evaluateBetaGate({ ...passing, previousStreak: 1, gateMonths: 3 })
                .published,
        ).toBe(false);
        expect(
            evaluateBetaGate({ ...passing, previousStreak: 2, gateMonths: 3 })
                .published,
        ).toBe(true);
    });
});

describe('betaDesignFromSample — фактический дизайн для счётчика', () => {
    const { sample } = syntheticBetaSample(DEFAULT_SYNTHETIC);

    it('p̄ = events/n, σ_S — выборочное СКО, r и d_eff — дефолты либо свои', () => {
        const design = betaDesignFromSample(sample);
        expect(design.pBar).toBeCloseTo(sample.events / sample.n, 12);
        expect(design.sdScore as number).toBeGreaterThan(1);
        expect(design.sdScore as number).toBeLessThan(2);
        expect(design.reliability).toBe(BETA_POWER_DEFAULTS.reliability);
        expect(design.designEffect).toBe(BETA_POWER_DEFAULTS.designEffect);
        const own = betaDesignFromSample(sample, {
            reliability: 0.85,
            designEffect: 1,
        });
        expect(own.reliability).toBe(0.85);
        expect(own.designEffect).toBe(1);
    });

    it('пустая выборка отдаёт ориентиры плана', () => {
        const empty = syntheticBetaSample({
            ...DEFAULT_SYNTHETIC,
            managers: 0,
        }).sample;
        expect(betaDesignFromSample(empty)).toEqual({
            pBar: BETA_POWER_DEFAULTS.pBar,
            sdScore: BETA_POWER_DEFAULTS.sdScore,
            reliability: BETA_POWER_DEFAULTS.reliability,
            designEffect: BETA_POWER_DEFAULTS.designEffect,
        });
    });

    it('счётчик по выборке совпадает с betaGateCountdown на том же дизайне', () => {
        const countdown = betaCountdownFromSample(sample, {
            presentationsPerMonth: 50,
        });
        expect(countdown).toEqual(
            betaGateCountdown({
                presentations: sample.n,
                presentationsPerMonth: 50,
                seTarget: BETA_GATE_DEFAULTS.gateSe,
                gateMonths: BETA_GATE_DEFAULTS.gateMonths,
                design: betaDesignFromSample(sample),
            }),
        );
        expect(countdown.presentationsLeft).toBe(0);
        expect(countdown.seNow as number).toBeLessThan(
            BETA_GATE_DEFAULTS.gateSe,
        );
    });
});
