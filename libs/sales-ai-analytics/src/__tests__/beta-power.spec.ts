import {
    BETA_POWER_DEFAULTS,
    betaGateCountdown,
    betaGatePassed,
    betaStandardError,
    presentationsForSe,
} from '../model/beta-power';

/** Фактический темп портала из плана §4.4: ≈ 50 презентаций в месяц. */
const PRESENTATIONS_PER_MONTH = 50;

describe('betaStandardError — ориентир мощности', () => {
    it('SE ≈ 1/√(n·p̄(1−p̄)·Var(S)·r·d_eff)', () => {
        const information = 0.4 * 0.6 * 1.5 * 1.5 * 0.7 * 0.8;
        expect(betaStandardError({ n: 675 })).toBeCloseTo(
            1 / Math.sqrt(675 * information),
            12,
        );
        expect(betaStandardError({ n: 675 })).toBeCloseTo(0.07, 3);
    });

    it('SE убывает как 1/√n', () => {
        const single = betaStandardError({ n: 200 });
        const quadruple = betaStandardError({ n: 800 });
        expect(quadruple).toBeCloseTo(single / 2, 10);
    });

    it('без наблюдений оценки нет', () => {
        expect(betaStandardError({ n: 0 })).toBe(Number.POSITIVE_INFINITY);
    });
});

describe('betaGateCountdown — счётчик «до оценки β»', () => {
    it('50 презентаций в месяц и ноль накопленных: 700–900 и 14–18 мес.', () => {
        const countdown = betaGateCountdown({
            presentations: 0,
            presentationsPerMonth: PRESENTATIONS_PER_MONTH,
        });
        expect(countdown.seNow).toBeNull();
        expect(countdown.presentationsLeft).toBeGreaterThanOrEqual(700);
        expect(countdown.presentationsLeft).toBeLessThanOrEqual(900);
        expect(countdown.monthsLeft as number).toBeGreaterThanOrEqual(14);
        expect(countdown.monthsLeft as number).toBeLessThanOrEqual(18);
        expect(countdown.holdMonths).toBe(1);
        expect(countdown.presentationsForSe).toBe(
            presentationsForSe(BETA_POWER_DEFAULTS.seTarget),
        );
    });

    it('для SE = 0,10 остаётся 350–450 презентаций и 7–9 месяцев', () => {
        const countdown = betaGateCountdown({
            presentations: 0,
            presentationsPerMonth: PRESENTATIONS_PER_MONTH,
            seTarget: 0.1,
        });
        expect(countdown.presentationsLeft).toBeGreaterThanOrEqual(350);
        expect(countdown.presentationsLeft).toBeLessThanOrEqual(450);
        expect(countdown.monthsLeft as number).toBeGreaterThanOrEqual(7);
        expect(countdown.monthsLeft as number).toBeLessThanOrEqual(9);
    });

    it('накопленные презентации уменьшают счётчик и SE', () => {
        const half = betaGateCountdown({
            presentations: 400,
            presentationsPerMonth: PRESENTATIONS_PER_MONTH,
        });
        const zero = betaGateCountdown({
            presentations: 0,
            presentationsPerMonth: PRESENTATIONS_PER_MONTH,
        });
        expect(half.presentationsLeft).toBe(zero.presentationsLeft - 400);
        expect(half.seNow as number).toBeGreaterThan(0.07);
        expect(half.seNow as number).toBeLessThan(0.1);
    });

    it('после набора объёма счётчик обнуляется', () => {
        const countdown = betaGateCountdown({
            presentations: 2000,
            presentationsPerMonth: PRESENTATIONS_PER_MONTH,
        });
        expect(countdown.presentationsLeft).toBe(0);
        expect(countdown.monthsLeft).toBe(0);
        expect(countdown.seNow as number).toBeLessThan(0.07);
    });

    it('без темпа месяцы не считаются', () => {
        const countdown = betaGateCountdown({
            presentations: 0,
            presentationsPerMonth: 0,
        });
        expect(countdown.monthsLeft).toBeNull();
        expect(countdown.presentationsLeft).toBeGreaterThan(0);
    });
});

describe('betaGatePassed — гейт публикации β', () => {
    const ci: readonly [number, number] = [0.9, 1.1];

    it('SE ≤ 0,07, интервал наклона накрывает 1, два месяца подряд', () => {
        expect(
            betaGatePassed({
                se: 0.07,
                calibrationSlopeCi90: ci,
                consecutiveMonths: 2,
            }),
        ).toBe(true);
    });

    it('одного месяца подряд недостаточно', () => {
        expect(
            betaGatePassed({
                se: 0.05,
                calibrationSlopeCi90: ci,
                consecutiveMonths: 1,
            }),
        ).toBe(false);
    });

    it('интервал наклона без единицы гейт не проходит', () => {
        expect(
            betaGatePassed({
                se: 0.05,
                calibrationSlopeCi90: [1.05, 1.3],
                consecutiveMonths: 3,
            }),
        ).toBe(false);
    });

    it('SE выше порога и отсутствие SE гейт не проходят', () => {
        expect(
            betaGatePassed({
                se: 0.08,
                calibrationSlopeCi90: ci,
                consecutiveMonths: 3,
            }),
        ).toBe(false);
        expect(
            betaGatePassed({
                se: null,
                calibrationSlopeCi90: ci,
                consecutiveMonths: 3,
            }),
        ).toBe(false);
    });
});
