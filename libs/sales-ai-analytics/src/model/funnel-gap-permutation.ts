import { FUNNEL_GAP_DEFAULTS, decomposeFunnelGap } from './funnel-gap';
import type {
    PermutationLeakInput,
    PermutationLeakResult,
} from './funnel-gap.types';
import { mulberry32, sampleBinomial } from './prng';

/**
 * Перестановочный тест доли ложных утечек (приёмка §6).
 *
 * Под нулевой гипотезой «менеджер равен норме» переходы каждого ребра
 * пересобираются из `Binomial(n_k, μ_k)` детерминированным ГПСЧ, после
 * чего применяется штатное правило утечки `decomposeFunnelGap`. Любая
 * объявленная утечка при таком входе — ложная; при 200 перемешиваниях
 * их доля среди проверенных рёбер должна быть ≤ 5 %.
 */
export function permutationLeakRate(
    input: PermutationLeakInput,
): PermutationLeakResult {
    const iterations = Math.max(
        1,
        input.iterations ?? FUNNEL_GAP_DEFAULTS.iterations,
    );
    const samples = input.samples ?? FUNNEL_GAP_DEFAULTS.permutationSamples;
    const random = mulberry32(input.seed);
    let tested = 0;
    let leaks = 0;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
        const edges = input.edges.map(edge => ({
            ...edge,
            successes: sampleBinomial(edge.exposure, edge.prior.mu, random),
        }));
        const result = decomposeFunnelGap({
            edges,
            paths: input.paths,
            samples,
            seed: input.seed + iteration + 1,
            minN: input.minN,
            practicalDelta: input.practicalDelta,
        });
        for (const leak of result.leaks) {
            if (leak.hidden) {
                continue;
            }
            tested += 1;
            leaks += leak.leak ? 1 : 0;
        }
    }

    return {
        falseLeakRatePct: tested > 0 ? (100 * leaks) / tested : 0,
        iterations,
        tested,
        leaks,
    };
}
