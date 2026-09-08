import { RAMP_DEFAULTS, applyRampToTarget, rampFactor } from '../model/ramp';

/**
 * Выход новичка на темп: `R(τ) = 1 − exp(−τ/τ₀)` и надбавка **к цели**
 * (план §4.6 и §4.9; Фаза 2, поток `p2-model-forecast-plan`).
 */

describe('rampFactor', () => {
    it('в день выхода 0, через τ₀ ≈ 0,63, через 3·τ₀ ≈ 0,95', () => {
        expect(rampFactor(0)).toBe(0);
        expect(rampFactor(3, 3)).toBeCloseTo(1 - Math.exp(-1), 10);
        expect(rampFactor(3, 3)).toBeCloseTo(0.632, 3);
        expect(rampFactor(9, 3)).toBeCloseTo(0.95, 2);
    });

    it('монотонно растёт и не превышает единицу', () => {
        for (let month = 1; month <= 36; month += 1) {
            expect(rampFactor(month)).toBeGreaterThan(rampFactor(month - 1));
            expect(rampFactor(month)).toBeLessThan(1);
        }
    });

    it('дефолт τ₀ — три месяца, отрицательный стаж считается нулевым', () => {
        expect(RAMP_DEFAULTS.tau0Months).toBe(3);
        expect(rampFactor(3)).toBeCloseTo(rampFactor(3, 3), 10);
        expect(rampFactor(-5)).toBe(0);
    });

    it('нулевой τ₀ вырождает ramp в единицу, деления на ноль нет', () => {
        expect(rampFactor(1, 0)).toBe(1);
        expect(Number.isFinite(rampFactor(1, 0))).toBe(true);
    });
});

describe('applyRampToTarget', () => {
    it('новичку цель поднимается на boost·(1 − R(τ))', () => {
        const result = applyRampToTarget(3, 0);
        expect(RAMP_DEFAULTS.volumeBoost).toBe(0.3);
        expect(result.multiplier).toBeCloseTo(1.3, 10);
        expect(result.value).toBeCloseTo(3.9, 10);
        expect(result.ramp).toBe(0);
    });

    it('у опытного менеджера множитель вырождается в единицу', () => {
        const result = applyRampToTarget(3, 36);
        expect(result.multiplier).toBeCloseTo(1, 4);
        expect(result.value).toBeCloseTo(3, 4);
    });

    it('нулевая надбавка выключает политику РОПа', () => {
        const result = applyRampToTarget(3, 0, { volumeBoost: 0 });
        expect(result.value).toBe(3);
        expect(result.multiplier).toBe(1);
    });

    it('τ₀ настраивается и меняет только скорость выхода', () => {
        const fast = applyRampToTarget(3, 3, { tau0Months: 1 });
        const slow = applyRampToTarget(3, 3, { tau0Months: 8 });
        expect(fast.value).toBeLessThan(slow.value);
        expect(fast.ramp).toBeGreaterThan(slow.ramp);
    });

    it('надбавка идёт к цели: функция чистая и норму не трогает', () => {
        const target = 3;
        const first = applyRampToTarget(target, 1);
        const second = applyRampToTarget(target, 1);
        expect(first).toEqual(second);
        expect(target).toBe(3);
    });
});
