import {
    KAPPA_DEFAULTS,
    KappaCell,
    estimateEdgeKappa,
    kappaFromRho,
    kleinmanRho,
    layerKappa,
    meanKappaLog,
    medianOf,
    regularizeKappaLog,
} from '../model/kappa';

const cellsOf = (successes: readonly number[], n = 100): KappaCell[] =>
    successes.map((s, index) => ({ managerId: `m${index}`, s, n }));

/** Одинаковые доли у всех менеджеров — разброс ниже биномиального. */
const HOMOGENEOUS = cellsOf([9, 9, 9, 9, 9, 9]);
/** Сильно разные доли — разброс выше биномиального. */
const HETEROGENEOUS = cellsOf([2, 5, 9, 15, 25, 35]);

describe('medianOf / layerKappa', () => {
    it('медиана нечётной и чётной выборки', () => {
        expect(medianOf([3, 1, 2])).toBe(2);
        expect(medianOf([4, 1, 2, 3])).toBe(2.5);
        expect(medianOf([])).toBe(0);
    });

    it('κ слоя = kappa_layer_ratio 0,4 × медиана знаменателя', () => {
        expect(KAPPA_DEFAULTS.layerRatio).toBe(0.4);
        expect(layerKappa([100, 120, 140])).toBeCloseTo(48, 9);
        // E4 ≈ 3 счёта — сила слоя сопоставима с E1 в своих единицах.
        expect(layerKappa([2, 3, 4])).toBeCloseTo(1.2, 9);
    });

    it('нулевые знаменатели в медиану слоя не входят', () => {
        expect(layerKappa([0, 0, 100, 120])).toBeCloseTo(44, 9);
    });
});

describe('kleinmanRho / kappaFromRho', () => {
    it('однородные менеджеры: ρ̂ ≤ 0 → κ = κ_max = 500', () => {
        const rho = kleinmanRho(HOMOGENEOUS);
        expect(rho).not.toBeNull();
        expect(rho as number).toBeLessThanOrEqual(0);
        expect(kappaFromRho(rho as number)).toBe(KAPPA_DEFAULTS.max);
        expect(KAPPA_DEFAULTS.max).toBe(500);
    });

    it('гетерогенные менеджеры: ρ̂ > 0 → слабая усадка', () => {
        const rho = kleinmanRho(HETEROGENEOUS);
        expect(rho as number).toBeGreaterThan(0);
        expect(rho as number).toBeCloseTo(0.1151, 4);
        expect(kappaFromRho(rho as number)).toBeCloseTo(7.688, 3);
    });

    it('clip((1 − ρ̂)/ρ̂, 5, 500) по обеим границам', () => {
        expect(kappaFromRho(0.9)).toBe(KAPPA_DEFAULTS.min);
        expect(kappaFromRho(0.001)).toBe(KAPPA_DEFAULTS.max);
        expect(kappaFromRho(0.02)).toBeCloseTo(49, 9);
    });

    it('ρ̂ не оценивается: < 2 ячеек или вырожденное p̄', () => {
        expect(kleinmanRho(cellsOf([9]))).toBeNull();
        expect(kleinmanRho(cellsOf([0, 0, 0]))).toBeNull();
        expect(kleinmanRho(cellsOf([100, 100, 100]))).toBeNull();
    });
});

describe('regularizeKappaLog / meanKappaLog', () => {
    it('регуляризация к пулу в логарифмах: (K_p·log κ̂ + 10·log κ̄)/(K_p + 10)', () => {
        const value = regularizeKappaLog(42, 6, 90);
        expect(value).toBeCloseTo(
            Math.exp((6 * Math.log(42) + 10 * Math.log(90)) / 16),
            9,
        );
        expect(value).toBeCloseTo(67.627, 3);
        // Логарифмическое среднее ≠ арифметическому (6·42 + 10·90)/16 = 76,5.
        expect(value).toBeLessThan(76.5);
    });

    it('без пула κ̂ не меняется', () => {
        expect(regularizeKappaLog(42, 6, 0)).toBe(42);
        expect(regularizeKappaLog(42, 0, 90)).toBeCloseTo(90, 9);
    });

    it('усреднение κ — геометрическое среднее', () => {
        expect(meanKappaLog([100, 400])).toBeCloseTo(200, 9);
        expect(meanKappaLog([])).toBe(0);
    });
});

describe('estimateEdgeKappa', () => {
    it('до гейта: early 100 на старте, late 30 после lateFromMonths', () => {
        const early = estimateEdgeKappa({ cells: HETEROGENEOUS, months: 2 });
        expect(early.kappa).toBe(KAPPA_DEFAULTS.edgeEarly);
        expect(early.source).toBe('early');
        expect(early.gateOpen).toBe(false);
        const late = estimateEdgeKappa({ cells: HETEROGENEOUS, months: 4 });
        expect(late.kappa).toBe(KAPPA_DEFAULTS.edgeLate);
        expect(late.source).toBe('late');
    });

    it('гейт закрыт при < 5 менеджерах даже с 12 месяцами', () => {
        const result = estimateEdgeKappa({
            cells: cellsOf([2, 9, 25, 35]),
            months: 12,
        });
        expect(result.gateOpen).toBe(false);
        expect(result.source).toBe('late');
        expect(result.rho).toBeNull();
    });

    it('≥ 6 мес. и ≥ 5 менеджеров: однородные → κ = 500 с пометкой', () => {
        const result = estimateEdgeKappa({ cells: HOMOGENEOUS, months: 6 });
        expect(result.gateOpen).toBe(true);
        expect(result.source).toBe('kleinman');
        expect(result.homogeneous).toBe(true);
        expect(result.kappa).toBe(500);
        expect(result.kappaHat).toBe(500);
    });

    it('гетерогенные на открытом гейте — слабая усадка', () => {
        const result = estimateEdgeKappa({ cells: HETEROGENEOUS, months: 9 });
        expect(result.homogeneous).toBe(false);
        expect(result.kappa).toBeCloseTo(7.688, 3);
        expect(result.kappa).toBeLessThan(KAPPA_DEFAULTS.edgeLate);
        expect(result.managers).toBe(6);
    });

    it('пул тянет κ̂ к κ̄ в логарифмической шкале', () => {
        const result = estimateEdgeKappa({
            cells: HETEROGENEOUS,
            months: 9,
            pool: { kappaBar: 100, portalManagers: 6 },
        });
        expect(result.kappaHat).toBeCloseTo(7.688, 3);
        expect(result.kappa).toBeGreaterThan(result.kappaHat as number);
        expect(result.kappa).toBeLessThan(100);
        expect(result.kappa).toBeCloseTo(
            Math.exp(
                (6 * Math.log(result.kappaHat as number) + 10 * Math.log(100)) /
                    16,
            ),
            9,
        );
    });

    it('вырожденное p̄ на открытом гейте — возврат к настройке', () => {
        const result = estimateEdgeKappa({
            cells: cellsOf([0, 0, 0, 0, 0]),
            months: 12,
        });
        expect(result.gateOpen).toBe(true);
        expect(result.source).toBe('late');
        expect(result.kappa).toBe(KAPPA_DEFAULTS.edgeLate);
    });

    it('κ_a темпов активностей — константа 20', () => {
        expect(KAPPA_DEFAULTS.activityDays).toBe(20);
    });
});
