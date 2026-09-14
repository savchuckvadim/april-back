import { newcombeDifference } from '../model/edge-rate';
import {
    NORMS_BACKTEST_DEFAULTS,
    NormsBacktestCell,
    backtestNorms,
} from '../model/norms-backtest';

/** Знаменатель ребра каждого менеджера в месяц. */
const N = 100;

/** Месяцы фикстуры: 12 подряд начиная с января 2026. */
const monthKey = (index: number): string =>
    `2026-${String(index + 1).padStart(2, '0')}`;

/**
 * Синтетика «6 менеджеров × 12 месяцев»: числитель ребра менеджера m в
 * месяце t задаёт функция — так фиксируется известный ответ.
 */
function synthetic(
    successes: (manager: number, month: number) => number,
    months = 12,
    managers = 6,
): NormsBacktestCell[] {
    return Array.from({ length: months }, (_, month) =>
        Array.from({ length: managers }, (_, manager) => ({
            monthKey: monthKey(month),
            managerId: `m${manager}`,
            s: successes(manager, month),
            n: N,
        })),
    ).flat();
}

/**
 * Устойчивые разрывы с ростом: базы менеджеров 5/8/12/20/25/30 из 100,
 * каждый месяц все растут на 1 п.п. Норма leave-one-out — среднее
 * остальных: m0–m2 ниже нормы всегда (5 < 19, 8 < 18,4, 12 < 17,6),
 * m3–m5 всегда выше (20 > 16, 25 > 15, 30 > 14); рост общий и на
 * сравнение не влияет.
 */
const BASE = [5, 8, 12, 20, 25, 30];
const withGrowth = (manager: number, month: number): number =>
    BASE[manager] + month;

/**
 * Плоская синтетика без сигнала: две тройки менеджеров чередуют 10 и 20
 * из 100 по чётным/нечётным месяцам — «ниже нормы» в t никогда не
 * повторяется в t+1.
 */
const alternating = (manager: number, month: number): number =>
    manager < 3 === (month % 2 === 0) ? 10 : 20;

describe('backtestNorms — rolling-origin гейт L2', () => {
    it('устойчивые разрывы с ростом: предсказание сбывается, гейт пройден', () => {
        const result = backtestNorms(synthetic(withGrowth));

        // Точки отсчёта: после 3 месяцев обучения — март…ноябрь, 9 штук.
        expect(result.origins).toEqual(
            Array.from({ length: 9 }, (_, index) => monthKey(index + 2)),
        );
        // 3 менеджера × 9 точек в каждой группе; ниже нормы в t+1 —
        // только предсказанные ниже.
        expect(result.predictedBelow).toEqual({ pairs: 27, below: 27 });
        expect(result.predictedAtOrAbove).toEqual({ pairs: 27, below: 0 });
        expect(result.delta).toBe(1);
        expect(result.ci90).toEqual(
            newcombeDifference(
                { successes: 27, exposure: 27 },
                { successes: 0, exposure: 27 },
            ),
        );
        // Ньюкомб 90 % для 27/27 против 0/27: нижняя граница
        // 1 − √((1 − 1/(1 + z²/27))² + (z²/27/(1 + z²/27))²) ≈ 0,871.
        expect(result.ci90?.[0]).toBeCloseTo(0.8712, 3);
        expect(result.status).toBe('pass');
        expect(result.reason).toBeNull();
    });

    it('плоская синтетика с чередованием: сигнала нет — гейт не пройден', () => {
        const result = backtestNorms(synthetic(alternating));

        // Чётные точки (5): тройка «10» предсказана ниже нормы, в t+1 у неё
        // 20 — выше; другая тройка предсказана не ниже, в t+1 у неё 10 —
        // ниже. Нечётные точки (4): суммы равны, никто не ниже, в t+1 ниже
        // тройка «10».
        expect(result.predictedBelow).toEqual({ pairs: 15, below: 0 });
        expect(result.predictedAtOrAbove).toEqual({
            pairs: 15 + 24,
            below: 15 + 12,
        });
        expect(result.delta).toBeCloseTo(-27 / 39, 12);
        expect(result.ci90).toEqual(
            newcombeDifference(
                { successes: 0, exposure: 15 },
                { successes: 27, exposure: 39 },
            ),
        );
        expect(result.ci90?.[0]).toBeLessThan(0);
        expect(result.status).toBe('fail');
        expect(result.reason).toBeNull();
    });

    it('плоская синтетика без различий: никто не ниже нормы — данных для проверки нет', () => {
        const result = backtestNorms(synthetic(() => 15));

        expect(result.predictedBelow).toEqual({ pairs: 0, below: 0 });
        expect(result.predictedAtOrAbove).toEqual({ pairs: 54, below: 0 });
        expect(result.status).toBe('insufficient');
        expect(result.reason).toBe('group-too-small');
        expect(result.ci90).toBeNull();
        expect(result.delta).toBeNull();
    });

    it('меньше minTrainMonths + 1 месяцев — insufficient без точек отсчёта', () => {
        const result = backtestNorms(synthetic(withGrowth, 3));

        expect(NORMS_BACKTEST_DEFAULTS.minTrainMonths).toBe(3);
        expect(result.status).toBe('insufficient');
        expect(result.reason).toBe('not-enough-months');
        expect(result.origins).toEqual([]);
    });

    it('единственная точка отсчёта: по 3 пары в группах меньше минимума 5', () => {
        const result = backtestNorms(synthetic(withGrowth, 4));

        expect(result.origins).toEqual([monthKey(2)]);
        expect(result.predictedBelow).toEqual({ pairs: 3, below: 3 });
        expect(result.predictedAtOrAbove).toEqual({ pairs: 3, below: 0 });
        expect(result.status).toBe('insufficient');
        expect(result.reason).toBe('group-too-small');
        // Интервал всё же посчитан — его видно в отчёте о гейте.
        expect(result.ci90).toEqual(
            newcombeDifference(
                { successes: 3, exposure: 3 },
                { successes: 0, exposure: 3 },
            ),
        );
    });

    it('порог группы и глубина обучения задаются параметрами', () => {
        const result = backtestNorms(synthetic(withGrowth, 4), {
            minGroupPairs: 3,
            minTrainMonths: 2,
        });

        expect(result.origins).toEqual([monthKey(1), monthKey(2)]);
        expect(result.predictedBelow).toEqual({ pairs: 6, below: 6 });
        expect(result.status).toBe('pass');
    });

    it('месяц с excludeFromNorms не участвует ни как проверяемый, ни как норма', () => {
        const cells = synthetic(withGrowth).map(cell =>
            cell.managerId === 'm0' && cell.monthKey === monthKey(5)
                ? { ...cell, excludeFromNorms: true }
                : cell,
        );
        const result = backtestNorms(cells);

        // Пара «m0 × точка май» выпала: в июне m0 проверять нечем.
        expect(result.predictedBelow).toEqual({ pairs: 26, below: 26 });
        expect(result.predictedAtOrAbove).toEqual({ pairs: 27, below: 0 });
        expect(result.status).toBe('pass');
    });

    it('менеджер, появившийся только в месяце t+1, в пары не идёт', () => {
        const cells = [
            ...synthetic(withGrowth),
            { monthKey: monthKey(11), managerId: 'm6', s: 1, n: N },
        ];
        const result = backtestNorms(cells);

        expect(
            result.predictedBelow.pairs + result.predictedAtOrAbove.pairs,
        ).toBe(54);
    });

    it('полоса стажа участвует в норме тем же правилом слоёв', () => {
        // Все шестеро в одной полосе → слой полосы совпадает с порталом,
        // ответ тот же, что и без полос.
        const cells = synthetic(withGrowth).map(cell => ({
            ...cell,
            tenureBand: '6-18',
        }));
        const result = backtestNorms(cells);

        expect(result.predictedBelow).toEqual({ pairs: 27, below: 27 });
        expect(result.status).toBe('pass');
    });
});
