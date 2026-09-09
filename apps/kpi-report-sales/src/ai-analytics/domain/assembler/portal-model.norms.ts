/**
 * Нормы рёбер портала и сила усадки κ за окно 6–12 месяцев (план §4.2,
 * поток 16a).
 *
 * ⚠ Производительность — риск потока: наивный leave-one-out по
 * «месяцы × менеджеры × рёбра» даёт O(n²) на каждый пересчёт. Здесь
 * нормы считаются ОДНИМ ПРОХОДОМ: пул слоя собирается один раз, а норма
 * менеджера получается вычитанием его собственного вклада. Результат
 * ложится в снапшот, витрина (поток 16b) его только читает.
 *
 * Совпадение с `leaveOneOutNorm` библиотеки — часть контракта: правила
 * слоёв (полоса стажа при ≥ 3 менеджерах, иначе портал; исключённые
 * менеджер-месяцы вне пула) живут в библиотеке, здесь только быстрый
 * эквивалент, покрытый сверкой в спеке.
 *
 * Чистые функции: без DI, Bitrix и Prisma.
 */
import {
    estimateEdgeKappa,
    KAPPA_DEFAULTS,
    NORM_HIERARCHY_DEFAULTS,
    resolveNumberParam,
    type EdgeKappaParams,
    type KappaCell,
    type NormLayer,
    type ParamContext,
} from '@lib/sales-ai-analytics';
import type {
    PortalEdgeNormFacts,
    PortalManagerEdgeNorm,
    PortalManagerMonth,
    PortalManagerNorms,
} from './portal-model.types';

/** Ячейка менеджера по ребру за всё окно: переходы s из знаменателя n. */
interface EdgeCell {
    managerId: string;
    tenureBand: string | null;
    s: number;
    n: number;
    /** Менеджер-месяцы исключены из норм — ячейка в пул не идёт. */
    excluded: boolean;
}

/** Пул слоя: суммы и число менеджеров в нём. */
interface Pool {
    s: number;
    n: number;
    managers: number;
}

export interface PortalNormsInput {
    /** Месячные снапшоты окна (все менеджеры, все месяцы). */
    readonly months: readonly PortalManagerMonth[];
    /** Месяцев сравнимой истории портала — вход гейта Клейнмана. */
    readonly windowMonths: number;
    /** Слои реестра параметров. */
    readonly registry: ParamContext;
    /** Минимум менеджеров полосы для собственного слоя (по умолчанию 3). */
    readonly minBandManagers?: number;
}

export interface PortalNormsResult {
    readonly edges: PortalEdgeNormFacts[];
    readonly managerNorms: PortalManagerNorms[];
}

const emptyPool = (): Pool => ({ s: 0, n: 0, managers: 0 });

const add = (pool: Pool, cell: EdgeCell): Pool => ({
    s: pool.s + cell.s,
    n: pool.n + cell.n,
    managers: pool.managers + 1,
});

const sub = (pool: Pool, cell: EdgeCell | undefined): Pool =>
    cell === undefined
        ? pool
        : {
              s: pool.s - cell.s,
              n: pool.n - cell.n,
              managers: pool.managers - 1,
          };

/**
 * Ячейки «менеджер × ребро» за окно: суммы s и n по месяцам. Полоса
 * стажа берётся из последнего месяца менеджера в окне — она и есть его
 * полоса на момент пересчёта.
 */
export function edgeCellsOf(
    months: readonly PortalManagerMonth[],
): Map<string, Map<string, EdgeCell>> {
    const byEdge = new Map<string, Map<string, EdgeCell>>();
    const ordered = [...months].sort((a, b) =>
        a.monthKey.localeCompare(b.monthKey),
    );
    for (const month of ordered) {
        for (const edge of month.edges) {
            const cells = byEdge.get(edge.edge) ?? new Map<string, EdgeCell>();
            const current = cells.get(month.managerId) ?? {
                managerId: month.managerId,
                tenureBand: month.tenureBand,
                s: 0,
                n: 0,
                excluded: true,
            };
            const usable = !month.excludeFromNorms;
            cells.set(month.managerId, {
                managerId: month.managerId,
                tenureBand: month.tenureBand ?? current.tenureBand,
                s: current.s + (usable ? Math.max(0, edge.s) : 0),
                n: current.n + (usable ? Math.max(0, edge.n) : 0),
                excluded: current.excluded && !usable,
            });
            byEdge.set(edge.edge, cells);
        }
    }

    return byEdge;
}

/** Ячейка идёт в пул нормы: месяц не исключён и знаменатель положителен. */
const isUsable = (cell: EdgeCell): boolean => !cell.excluded && cell.n > 0;

/** Переопределения гейта и границ κ из реестра параметров. */
function kappaParams(registry: ParamContext): Partial<EdgeKappaParams> {
    const early = resolveNumberParam('kappa_edge_early', registry);
    const late = resolveNumberParam('kappa_edge_late', registry);
    const max = resolveNumberParam('kappa_max', registry);

    return {
        ...(early === undefined ? {} : { edgeEarly: early }),
        ...(late === undefined ? {} : { edgeLate: late }),
        ...(max === undefined ? {} : { max }),
    };
}

/** Пулы слоёв ребра: портал целиком и каждая полоса стажа отдельно. */
function poolsOf(cells: readonly EdgeCell[]): {
    portal: Pool;
    bands: Map<string, Pool>;
} {
    const bands = new Map<string, Pool>();
    let portal = emptyPool();
    for (const cell of cells) {
        portal = add(portal, cell);
        if (cell.tenureBand === null) continue;
        bands.set(
            cell.tenureBand,
            add(bands.get(cell.tenureBand) ?? emptyPool(), cell),
        );
    }

    return { portal, bands };
}

/** Норма слоя из пула: μ, слой и доля данных. */
function normOf(
    pool: Pool,
    useBand: boolean,
    kappa: number,
    edge: string,
): PortalManagerEdgeNorm {
    const layer: NormLayer =
        pool.n <= 0 ? 'global' : useBand ? 'tenure' : 'portal';

    return {
        edge,
        mu: pool.n > 0 ? pool.s / pool.n : 0,
        layer,
        n: Math.max(0, pool.n),
        w: pool.n > 0 ? 1 : 0,
        kappa,
    };
}

/**
 * Нормы портала и leave-one-out нормы каждого менеджера по всем рёбрам.
 * Один проход на ребро: пул слоя минус вклад менеджера.
 */
export function buildPortalNorms(input: PortalNormsInput): PortalNormsResult {
    const minBand =
        input.minBandManagers ?? NORM_HIERARCHY_DEFAULTS.minBandManagers;
    const params = kappaParams(input.registry);
    const byEdge = edgeCellsOf(input.months);
    const managers = [
        ...new Set(input.months.map(month => month.managerId)),
    ].sort();
    const bandOf = new Map(
        [...input.months]
            .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
            .map(month => [month.managerId, month.tenureBand] as const),
    );
    const edges: PortalEdgeNormFacts[] = [];
    const normsByManager = new Map<string, PortalManagerEdgeNorm[]>();

    for (const [edge, cells] of [...byEdge.entries()].sort(([a], [b]) =>
        a.localeCompare(b),
    )) {
        const usable = [...cells.values()].filter(isUsable);
        const { portal, bands } = poolsOf(usable);
        const kappa = estimateEdgeKappa({
            cells: usable.map(
                (cell): KappaCell => ({
                    managerId: cell.managerId,
                    s: cell.s,
                    n: cell.n,
                }),
            ),
            months: input.windowMonths,
            params,
        });
        edges.push({
            edge,
            mu: portal.n > 0 ? portal.s / portal.n : 0,
            n: Math.max(0, portal.n),
            kappa: kappa.kappa,
            layer: portal.n > 0 ? 'portal' : 'global',
            managers: portal.managers,
            kappaSource: kappa.source === 'kleinman' ? 'kleinman' : 'default',
            kappaKind: kappa.source,
            kappaGateOpen: kappa.gateOpen,
            rho: kappa.rho,
            homogeneous: kappa.homogeneous,
        });
        for (const managerId of managers) {
            const own = cells.get(managerId);
            const ownUsable =
                own !== undefined && isUsable(own) ? own : undefined;
            const band = bandOf.get(managerId) ?? null;
            const bandPool =
                band === null
                    ? emptyPool()
                    : sub(bands.get(band) ?? emptyPool(), ownUsable);
            const useBand = band !== null && bandPool.managers >= minBand;
            const pool = useBand ? bandPool : sub(portal, ownUsable);
            normsByManager.set(managerId, [
                ...(normsByManager.get(managerId) ?? []),
                normOf(pool, useBand, kappa.kappa, edge),
            ]);
        }
    }

    return {
        edges,
        managerNorms: managers.map(managerId => ({
            managerId,
            tenureBand: bandOf.get(managerId) ?? null,
            edges: normsByManager.get(managerId) ?? [],
        })),
    };
}

/** Дефолты κ реестра — их же показывает витрина при непройденном гейте. */
export const PORTAL_KAPPA_DEFAULTS = KAPPA_DEFAULTS;
