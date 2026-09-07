import { layerKappa } from '../model/kappa';
import {
    NORM_HIERARCHY_DEFAULTS,
    NormCell,
    leaveOneOutNorm,
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
