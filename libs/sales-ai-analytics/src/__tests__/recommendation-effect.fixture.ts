import { leverKeyOf } from '../model/lever-key.util';
import { AI_LEVERS, type AiLever } from '../model/lever.types';
import { mulberry32, sampleBinomial, seedOf } from '../model/prng';
import type {
    EdgeSamples,
    IssuedRecommendation,
} from '../model/recommendation-effect.types';

/**
 * Синтетика для спек эффекта советов (Фаза 4, П18): советы с известными
 * долями выполнения, несогласий и конверсий рёбер «до» и «после».
 * Случайность — только через seedOf/mulberry32 из `model/prng.ts`.
 */
export interface SyntheticEffectOptions {
    readonly seed: string;
    readonly issued: number;
    /** Доля советов с закрытым окном «после». */
    readonly closedShare: number;
    readonly doneProbability: number;
    readonly disagreeProbability: number;
    /** Конверсия рёбер до/после по коду ребра. */
    readonly edges: Readonly<
        Record<string, { readonly before: number; readonly after: number }>
    >;
    /** Знаменатель ребра на один совет. */
    readonly edgeN: number;
    readonly levers?: readonly AiLever[];
    readonly managers?: number;
}

const MONTHS = ['2026-03', '2026-04', '2026-05'] as const;

const samplesOf = (
    edges: SyntheticEffectOptions['edges'],
    edgeN: number,
    pick: 'before' | 'after',
    random: () => number,
): EdgeSamples =>
    Object.fromEntries(
        Object.keys(edges)
            .sort()
            .map(edge => [
                edge,
                {
                    s: sampleBinomial(edgeN, edges[edge][pick], random),
                    n: edgeN,
                },
            ]),
    );

/** Список выданных советов с известными параметрами. */
export function syntheticIssued(
    options: SyntheticEffectOptions,
): IssuedRecommendation[] {
    const random = mulberry32(seedOf('recommendation-effect', options.seed));
    const levers = options.levers ?? AI_LEVERS;
    const managers = options.managers ?? 6;
    const out: IssuedRecommendation[] = [];
    for (let index = 0; index < options.issued; index += 1) {
        const lever = levers[index % levers.length];
        const managerId = `m${(index % managers) + 1}`;
        const monthKey = MONTHS[index % MONTHS.length];
        const closed = random() < options.closedShare;
        out.push({
            key: leverKeyOf({
                lever,
                ruleCode: `${lever}-rule`,
                section: `s${index % 3}`,
            }),
            lever,
            managerId,
            monthKey,
            done: random() < options.doneProbability,
            disagree: random() < options.disagreeProbability,
            before: samplesOf(options.edges, options.edgeN, 'before', random),
            after: closed
                ? samplesOf(options.edges, options.edgeN, 'after', random)
                : null,
        });
    }

    return out;
}

/** Совет с заданными числами — для точечных проверок. */
export function issuedOf(
    overrides: Partial<IssuedRecommendation> & { readonly key?: string },
): IssuedRecommendation {
    return {
        key: 'volume:volume-below-capacity:::',
        lever: 'volume',
        managerId: 'm1',
        monthKey: '2026-03',
        done: true,
        disagree: false,
        before: { presentation_to_offer: { s: 4, n: 35 } },
        after: { presentation_to_offer: { s: 12, n: 35 } },
        ...overrides,
    };
}

/** Перемешивание списка тем же потоком случайности (проверка порядка входа). */
export function shuffled<T>(items: readonly T[], seed: string): T[] {
    const random = mulberry32(seedOf('shuffle', seed));
    const out = [...items];
    for (let index = out.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(random() * (index + 1));
        [out[index], out[swap]] = [out[swap], out[index]];
    }

    return out;
}
