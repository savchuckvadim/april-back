import { StyleAxisCode } from './style-axes.const';
import {
    AxisPosterior,
    mixPosterior,
    normalCdf,
    tauPosterior,
} from './style-shrink';
import {
    STYLE_CONFIDENCE_REASONS,
    STYLE_PROFILE_DEFAULTS,
    StyleAxisEstimate,
    StyleConfidence,
    StyleRow,
} from './style-profile.types';

/**
 * Оценка одной оси стиля (документ `ai/tasks/ai-analytics-manager-style.md`,
 * раздел 3.1, шаги 2–5): оффсет полосы стажа → LOO-норма коллег → усадка с
 * интегрированием по τ → ROPE и частотный пол.
 *
 * Leave-one-out здесь буквальный: и среднее коллег, и их разброс σ_w, и
 * оффсет полосы стажа считаются БЕЗ строк самого менеджера — иначе он
 * сравнивался бы сам с собой и отклонение занижалось бы тем сильнее, чем
 * больше у него данных.
 *
 * Детерминизм: сетка τ фиксирована, коллеги отсортированы по managerId,
 * `Math.random` и `Date.now` не используются.
 */

/** Контекст расчёта оси — пороги реестра, разложенные по вызову. */
export interface StyleAxisContext {
    minCalls: number;
    minLikely: number;
    minPeers: number;
    peerMinCalls: number;
    ropeDelta: number;
    intervalZ: number;
    tenureKappa: number;
    bands: Readonly<Record<string, string>>;
}

interface AxisStat {
    managerId: string;
    n: number;
    mean: number;
    /** Σ(x − mean)² внутри менеджера. */
    ss: number;
}

/** Статистики оси по менеджерам в детерминированном порядке. */
function axisStats(rows: readonly StyleRow[], axis: StyleAxisCode): AxisStat[] {
    const byManager = new Map<string, number[]>();
    for (const row of rows) {
        const value = row.axes[axis];
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            continue;
        }
        byManager.set(row.managerId, [
            ...(byManager.get(row.managerId) ?? []),
            value,
        ]);
    }
    return [...byManager.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([managerId, values]) => {
            const mean =
                values.reduce((acc, value) => acc + value, 0) / values.length;
            return {
                managerId,
                n: values.length,
                mean,
                ss: values.reduce((acc, value) => acc + (value - mean) ** 2, 0),
            };
        });
}

/**
 * Оффсеты полос стажа по коллегам: среднее полосы, стянутое к нулю с силой
 * `style_tenure_kappa` — полоса из одного-двух человек получает почти
 * нулевой оффсет автоматически, и стажёр не объявляется «исследователем»
 * только потому, что он стажёр.
 */
function bandOffsets(
    peers: readonly AxisStat[],
    bands: Readonly<Record<string, string>>,
    kappa: number,
): Map<string, number> {
    const byBand = new Map<string, number[]>();
    for (const peer of peers) {
        const band = bands[peer.managerId];
        if (band !== undefined) {
            byBand.set(band, [...(byBand.get(band) ?? []), peer.mean]);
        }
    }
    return new Map(
        [...byBand.entries()].map(([band, means]) => {
            const size = means.length;
            const mean = means.reduce((acc, value) => acc + value, 0) / size;
            return [band, (size * mean) / (size + Math.max(0, kappa))];
        }),
    );
}

/** Доверие оси: мало коллег, мало единиц или отдел по оси неразличим. */
function axisConfidence(
    n: number,
    peers: number,
    tauUpper80: number,
    sigmaW: number,
    context: StyleAxisContext,
): StyleConfidence {
    const { fewCalls, fewPeers, indistinguishable } = STYLE_CONFIDENCE_REASONS;
    if (peers < STYLE_PROFILE_DEFAULTS.minPeersLikely) {
        return { level: 'none', reason: fewPeers };
    }
    if (n < context.minLikely) {
        return { level: 'none', reason: fewCalls };
    }
    if (tauUpper80 < STYLE_PROFILE_DEFAULTS.indistinguishableTau * sigmaW) {
        return { level: 'none', reason: indistinguishable };
    }
    if (n < context.minCalls) {
        return { level: 'low', reason: fewCalls };
    }
    if (peers < context.minPeers) {
        return { level: 'low', reason: fewPeers };
    }
    return { level: 'ok' };
}

/** σ_w коллег: пул внутриминеджерского разброса без строк субъекта. */
function pooledSigmaW(peers: readonly AxisStat[]): number {
    const degrees = peers.reduce((acc, peer) => acc + peer.n - 1, 0);
    if (degrees <= 0) {
        return 1;
    }
    const within = peers.reduce((acc, peer) => acc + peer.ss, 0) / degrees;
    return Math.sqrt(Math.max(1e-9, within));
}

/**
 * Оценка оси для менеджера: LOO-норма коллег, усадка к ней, вероятность
 * практически заметного отклонения `p_ROPE` и частотный пол `z_raw`.
 * `null` — у менеджера по этой оси нет ни одной единицы.
 */
export function estimateStyleAxis(
    rows: readonly StyleRow[],
    axis: StyleAxisCode,
    managerId: string,
    context: StyleAxisContext,
): StyleAxisEstimate | null {
    const stats = axisStats(rows, axis);
    const subject = stats.find(stat => stat.managerId === managerId);
    if (subject === undefined || subject.n === 0) {
        return null;
    }
    const peers = stats.filter(
        stat => stat.managerId !== managerId && stat.n >= context.peerMinCalls,
    );
    const sigmaW = pooledSigmaW(peers);
    const offsets = bandOffsets(peers, context.bands, context.tenureKappa);
    const offsetOf = (id: string): number =>
        offsets.get(context.bands[id] ?? '') ?? 0;
    const subjectVar = (sigmaW * sigmaW) / subject.n;
    const posterior: AxisPosterior =
        peers.length === 0
            ? { dTilde: 0, sdPost: 0, mu: 0, varMu: 0, tauUpper80: 0 }
            : mixPosterior(
                  subject.mean - offsetOf(managerId),
                  subjectVar,
                  tauPosterior(
                      peers.map(peer => peer.mean - offsetOf(peer.managerId)),
                      peers.map(peer => (sigmaW * sigmaW) / peer.n),
                      sigmaW,
                  ),
              );
    const rawContrast =
        peers.length === 0
            ? 0
            : subject.mean - offsetOf(managerId) - posterior.mu;
    const seRaw = Math.sqrt(subjectVar + posterior.varMu);
    const zRaw = seRaw > 0 ? Math.abs(rawContrast) / seRaw : 0;
    const half = context.intervalZ * posterior.sdPost;
    return {
        code: axis,
        n: subject.n,
        peers: peers.length,
        sigmaW,
        rawContrast,
        seRaw,
        zRaw,
        pRaw: 2 * (1 - normalCdf(zRaw)),
        dTilde: posterior.dTilde,
        sdPost: posterior.sdPost,
        ci80: [posterior.dTilde - half, posterior.dTilde + half],
        pRope:
            posterior.sdPost > 0
                ? normalCdf(
                      (Math.abs(posterior.dTilde) - context.ropeDelta) /
                          posterior.sdPost,
                  )
                : Number(Math.abs(posterior.dTilde) >= context.ropeDelta),
        tauUpper80: posterior.tauUpper80,
        confidence: axisConfidence(
            subject.n,
            peers.length,
            posterior.tauUpper80,
            sigmaW,
            context,
        ),
    };
}
