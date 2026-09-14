import { layerKappa } from '../model/kappa';
import {
    NORM_FLAG_EXPLANATIONS,
    NORM_FLAGS,
    NORM_HIERARCHY_DEFAULTS,
    NormCell,
    leaveOneOutNorm,
    levelNormFlag,
    levelNormUnderstated,
    toShrinkPrior,
} from '../model/norms-hierarchy';
import { shrinkRate } from '../model/shrink';

/** Портал: полоса junior (0–6 мес.) из 4 менеджеров и senior из 2. */
const CELLS: NormCell[] = [
    { managerId: 'm1', tenureBand: 'junior', s: 4, n: 15 },
    { managerId: 'm2', tenureBand: 'junior', s: 9, n: 100 },
    { managerId: 'm3', tenureBand: 'junior', s: 8, n: 100 },
    { managerId: 'm4', tenureBand: 'junior', s: 10, n: 100 },
    { managerId: 'm5', tenureBand: 'senior', s: 30, n: 100 },
    { managerId: 'm6', tenureBand: 'senior', s: 26, n: 100 },
];

describe('leaveOneOutNorm', () => {
    it('полоса стажа без менеджера m: сам менеджер в норму не входит', () => {
        const norm = leaveOneOutNorm({
            cells: CELLS,
            managerId: 'm1',
            tenureBand: 'junior',
        });
        expect(norm.layer).toBe('tenure');
        expect(norm.n).toBe(300);
        expect(norm.value).toBeCloseTo(27 / 300, 9);
        expect(norm.excludedManagerId).toBe('m1');
        expect(norm.w).toBe(1);
    });

    it('норма меняется от менеджера к менеджеру (leave-one-out)', () => {
        const forM2 = leaveOneOutNorm({
            cells: CELLS,
            managerId: 'm2',
            tenureBand: 'junior',
        });
        expect(forM2.n).toBe(215);
        expect(forM2.value).toBeCloseTo(22 / 215, 9);
        expect(forM2.value).not.toBeCloseTo(27 / 300, 6);
    });

    it('при < 3 менеджерах полосы норма падает на слой портала', () => {
        const norm = leaveOneOutNorm({
            cells: CELLS,
            managerId: 'm5',
            tenureBand: 'senior',
        });
        expect(norm.layer).toBe('portal');
        // Портал без m5: 4 + 9 + 8 + 10 + 26 из 15 + 400.
        expect(norm.n).toBe(415);
        expect(norm.value).toBeCloseTo(57 / 415, 9);
        expect(NORM_HIERARCHY_DEFAULTS.minBandManagers).toBe(3);
    });

    it('без полосы стажа сразу слой портала', () => {
        const norm = leaveOneOutNorm({ cells: CELLS, managerId: 'm1' });
        expect(norm.layer).toBe('portal');
        expect(norm.n).toBe(500);
        expect(norm.value).toBeCloseTo(83 / 500, 9);
    });

    it('менеджер-месяцы с excludeFromNorms в пул не идут', () => {
        const cells: NormCell[] = [
            ...CELLS,
            {
                managerId: 'm7',
                tenureBand: 'junior',
                s: 40,
                n: 40,
                excludeFromNorms: true,
            },
        ];
        const norm = leaveOneOutNorm({
            cells,
            managerId: 'm1',
            tenureBand: 'junior',
        });
        expect(norm.n).toBe(300);
        expect(norm.value).toBeCloseTo(27 / 300, 9);
    });

    it('до пула kappa_portal_to_global = 0: верхний слой — сам портал', () => {
        expect(NORM_HIERARCHY_DEFAULTS.portalToGlobal).toBe(0);
        const norm = leaveOneOutNorm({
            cells: CELLS,
            managerId: 'm1',
            tenureBand: 'junior',
            global: { mu: 0.5, kappa: 0 },
        });
        expect(norm.layer).toBe('tenure');
        expect(norm.value).toBeCloseTo(27 / 300, 9);
        expect(norm.w).toBe(1);
    });

    it('глобальный слой с κ > 0 подмешивается и даёт w < 1', () => {
        const norm = leaveOneOutNorm({
            cells: CELLS,
            managerId: 'm1',
            tenureBand: 'junior',
            global: { mu: 0.5, kappa: 100 },
        });
        expect(norm.value).toBeCloseTo((27 + 50) / 400, 9);
        expect(norm.w).toBeCloseTo(0.75, 9);
        expect(norm.layer).toBe('tenure');
    });

    it('единственный менеджер портала: пул пуст → глобальный слой', () => {
        const norm = leaveOneOutNorm({
            cells: [CELLS[0]],
            managerId: 'm1',
            tenureBand: 'junior',
            global: { mu: 0.09, kappa: 0 },
        });
        expect(norm.layer).toBe('global');
        expect(norm.value).toBeCloseTo(0.09, 9);
        expect(norm.n).toBe(0);
        expect(norm.w).toBe(0);
    });

    it('норма слоя как прайор усадки: μ из LOO, κ = 0,4 × медиана', () => {
        const norm = leaveOneOutNorm({
            cells: CELLS,
            managerId: 'm1',
            tenureBand: 'junior',
        });
        const kappa = layerKappa(CELLS.map(cell => cell.n));
        expect(kappa).toBeCloseTo(40, 9);
        const prior = toShrinkPrior(norm, kappa);
        expect(prior.mu).toBeCloseTo(0.09, 9);
        expect(prior.kappa).toBe(40);
        const posterior = shrinkRate({
            successes: 4,
            exposure: 15,
            prior: { mu: prior.mu, kappa: 30 },
        });
        // Числа плана §4.2: μ = 0,09, κ = 30 → (4 + 2,7)/45 = 0,149.
        expect(posterior.value).toBeCloseTo(0.1489, 4);
    });
});

describe('levelNormUnderstated — полоса занижена составом (план §4.2)', () => {
    it('μ_lk < 0,7·μ_pk → флаг, на границе и выше — нет', () => {
        expect(NORM_HIERARCHY_DEFAULTS.levelUnderstatedRatio).toBe(0.7);
        expect(levelNormUnderstated(0.1, 0.2)).toBe(true);
        expect(levelNormUnderstated(0.15, 0.2)).toBe(false);
        // Ровно 0,7·μ_pk — не ниже (строгое неравенство).
        expect(levelNormUnderstated(0.7, 1)).toBe(false);
    });

    it('нулевая норма портала или NaN — сравнивать не с чем', () => {
        expect(levelNormUnderstated(0.1, 0)).toBe(false);
        expect(levelNormUnderstated(Number.NaN, 0.2)).toBe(false);
    });

    it('доля переопределяется параметром', () => {
        expect(levelNormUnderstated(0.15, 0.2, 0.8)).toBe(true);
        expect(levelNormUnderstated(0.15, 0.2, 0.7)).toBe(false);
    });

    it('флаг витрины с объяснением; без нормы портала флага нет', () => {
        expect(levelNormFlag(0.1, 0.2)).toBe('level_norm_understated');
        expect(levelNormFlag(0.15, 0.2)).toBeNull();
        expect(levelNormFlag(0.1, null)).toBeNull();
        expect([...NORM_FLAGS]).toEqual(['level_norm_understated']);
        expect(NORM_FLAG_EXPLANATIONS.level_norm_understated).toMatch(
            /составом/,
        );
        expect(NORM_FLAG_EXPLANATIONS.level_norm_understated).not.toMatch(
            /значим/,
        );
    });
});

describe('leaveOneOutNorm — норма портала рядом с нормой полосы', () => {
    it('слой полосы: portalValue — портал без менеджера, флаг по правилу 0,7', () => {
        const norm = leaveOneOutNorm({
            cells: CELLS,
            managerId: 'm1',
            tenureBand: 'junior',
        });

        expect(norm.layer).toBe('tenure');
        // Портал без m1: (9 + 8 + 10 + 30 + 26) / 500.
        expect(norm.portalValue).toBeCloseTo(83 / 500, 9);
        // 0,09 < 0,7 · 0,166 = 0,116 → полоса занижена составом.
        expect(norm.bandUnderstated).toBe(
            levelNormUnderstated(27 / 300, 83 / 500),
        );
        expect(norm.bandUnderstated).toBe(true);
    });

    it('слой портала: второй нормы и флага нет', () => {
        const norm = leaveOneOutNorm({
            cells: CELLS,
            managerId: 'm5',
            tenureBand: 'senior',
        });

        expect(norm.layer).toBe('portal');
        expect(norm.portalValue).toBeNull();
        expect(norm.bandUnderstated).toBe(false);
    });

    it('полоса не ниже 0,7 портала → флага нет', () => {
        const cells: NormCell[] = [
            { managerId: 'a', tenureBand: 'junior', s: 10, n: 100 },
            { managerId: 'b', tenureBand: 'junior', s: 16, n: 100 },
            { managerId: 'c', tenureBand: 'junior', s: 18, n: 100 },
            { managerId: 'd', tenureBand: 'junior', s: 17, n: 100 },
            { managerId: 'e', tenureBand: 'senior', s: 20, n: 100 },
        ];
        const norm = leaveOneOutNorm({
            cells,
            managerId: 'a',
            tenureBand: 'junior',
        });

        expect(norm.value).toBeCloseTo(51 / 300, 9);
        expect(norm.portalValue).toBeCloseTo(71 / 400, 9);
        expect(norm.bandUnderstated).toBe(false);
    });
});

describe('leaveOneOutNorm — κ_boot нового портала (план §4.2)', () => {
    const global = { mu: 0.5, kappa: 0 };

    it('новый портал (≤ 3 мес.): дефолт дампа подмешан силой 0,2·median(ñ)', () => {
        const norm = leaveOneOutNorm({
            cells: CELLS,
            managerId: 'm1',
            tenureBand: 'junior',
            global,
            boot: { months: 2 },
        });

        expect(NORM_HIERARCHY_DEFAULTS.bootRatio).toBe(0.2);
        expect(NORM_HIERARCHY_DEFAULTS.bootMonths).toBe(3);
        // Пул портала без m1: пять ячеек по 100 → median 100, κ_boot = 20.
        expect(norm.globalKappa).toBe(20);
        expect(norm.boot).toBe(true);
        expect(norm.value).toBeCloseTo((27 + 20 * 0.5) / 320, 9);
        expect(norm.w).toBeCloseTo(300 / 320, 9);
        expect(norm.layer).toBe('tenure');
        expect(norm.n).toBe(300);
    });

    it('после 3 месяцев итог не зависит от μ_0k', () => {
        const norm = leaveOneOutNorm({
            cells: CELLS,
            managerId: 'm1',
            tenureBand: 'junior',
            global,
            boot: { months: 4 },
        });

        expect(norm.globalKappa).toBe(0);
        expect(norm.boot).toBe(false);
        expect(norm.value).toBeCloseTo(27 / 300, 9);
        expect(norm.w).toBe(1);
    });

    it('без дефолта дампа κ_boot не действует даже на новом портале', () => {
        const norm = leaveOneOutNorm({
            cells: CELLS,
            managerId: 'm1',
            tenureBand: 'junior',
            boot: { months: 1 },
        });

        expect(norm.boot).toBe(false);
        expect(norm.globalKappa).toBe(0);
        expect(norm.value).toBeCloseTo(27 / 300, 9);
    });

    it('настроенная κ_global сильнее κ_boot — берётся большая', () => {
        const norm = leaveOneOutNorm({
            cells: CELLS,
            managerId: 'm1',
            tenureBand: 'junior',
            global: { mu: 0.5, kappa: 100 },
            boot: { months: 1 },
        });

        expect(norm.globalKappa).toBe(100);
        expect(norm.boot).toBe(false);
        expect(norm.value).toBeCloseTo((27 + 50) / 400, 9);
    });

    it('доля и граница нового портала переопределяются параметрами', () => {
        const norm = leaveOneOutNorm({
            cells: CELLS,
            managerId: 'm1',
            tenureBand: 'junior',
            global,
            boot: { months: 5, ratio: 0.5, untilMonths: 6 },
        });

        expect(norm.globalKappa).toBe(50);
        expect(norm.boot).toBe(true);
        expect(norm.value).toBeCloseTo((27 + 25) / 350, 9);
    });

    it('κ_boot пропорционален медиане знаменателя: доля данных w от масштаба не зависит', () => {
        const small = leaveOneOutNorm({
            cells: CELLS,
            managerId: 'm1',
            tenureBand: 'junior',
            global,
            boot: { months: 1 },
        });
        const large = leaveOneOutNorm({
            cells: CELLS.map(cell => ({
                ...cell,
                s: cell.s * 10,
                n: cell.n * 10,
            })),
            managerId: 'm1',
            tenureBand: 'junior',
            global,
            boot: { months: 1 },
        });

        // κ_boot растёт с медианой (20 → 200), но доля данных та же:
        // усадка к дефолту — доля экспозиции, а не константа.
        expect(large.globalKappa).toBe(200);
        expect(large.w).toBeCloseTo(small.w, 9);
        expect(small.w).toBeCloseTo(300 / 320, 9);
    });

    it('пустой пул портала: норма — дефолт дампа с w = 0 и без κ_boot', () => {
        const norm = leaveOneOutNorm({
            cells: [CELLS[0]],
            managerId: 'm1',
            tenureBand: 'junior',
            global: { mu: 0.09, kappa: 0 },
            boot: { months: 1 },
        });

        expect(norm.layer).toBe('global');
        expect(norm.value).toBeCloseTo(0.09, 9);
        expect(norm.w).toBe(0);
        expect(norm.boot).toBe(false);
        expect(norm.portalValue).toBeNull();
    });
});
