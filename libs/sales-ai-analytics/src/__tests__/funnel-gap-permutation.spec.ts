import type {
    FunnelEdgeInput,
    FunnelPathInput,
} from '../model/funnel-gap.types';
import { permutationLeakRate } from '../model/funnel-gap-permutation';
import { seedOf } from '../model/prng';

/**
 * Приёмка §6: перестановочный тест на 200 перемешиваниях даёт не более
 * 5 % ложных утечек. Под нулевой гипотезой менеджер равен норме, поэтому
 * любая объявленная утечка — ложная.
 */
const SEED = seedOf('demo.bitrix24.ru', 'permutation', 'sam-1.0.0');

const EDGES: readonly FunnelEdgeInput[] = [
    {
        code: 'e1',
        successes: 30,
        exposure: 100,
        prior: { mu: 0.3, kappa: 30 },
        volume: 100,
    },
    {
        code: 'e5',
        successes: 8,
        exposure: 40,
        prior: { mu: 0.2, kappa: 30 },
        volume: 40,
    },
];

const PATHS: readonly FunnelPathInput[] = [
    { code: 'call-to-sale', edges: ['e1', 'e5'] },
];

describe('permutationLeakRate — доля ложных утечек', () => {
    it('200 перемешиваний дают не более 5 % ложных утечек', () => {
        const result = permutationLeakRate({
            edges: EDGES,
            paths: PATHS,
            iterations: 200,
            seed: SEED,
        });
        expect(result.iterations).toBe(200);
        expect(result.tested).toBe(400);
        // Фактическая доля на этой фикстуре — 3,25 % (13 из 400 рёбер):
        // правило утечки не вырождено, но остаётся ниже приёмочных 5 %.
        expect(result.falseLeakRatePct).toBeGreaterThan(0);
        expect(result.falseLeakRatePct).toBeLessThanOrEqual(5);
    }, 120000);

    it('результат воспроизводим по seed', () => {
        const options = {
            edges: EDGES,
            paths: PATHS,
            iterations: 20,
            samples: 200,
            seed: SEED,
        };
        expect(permutationLeakRate(options)).toEqual(
            permutationLeakRate(options),
        );
    }, 60000);
});
