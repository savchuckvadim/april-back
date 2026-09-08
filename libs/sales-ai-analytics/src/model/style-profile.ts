import { STYLE_AXES, findStyleAxis } from './style-axes.const';
import { StyleAxisContext, estimateStyleAxis } from './style-axis';
import {
    STYLE_CONFIDENCE_REASONS,
    STYLE_PROFILE_DEFAULTS,
    StyleAxisEstimate,
    StyleConfidence,
    StyleProfile,
    StyleProfileOptions,
    StyleRow,
    StyleTag,
} from './style-profile.types';
import {
    StyleTagTier,
    styleNumber,
    styleTagFor,
    styleTagLabel,
} from './style-tags.const';

/**
 * Профиль стиля менеджера (документ `ai/tasks/ai-analytics-manager-style.md`,
 * разделы 2 и 3): вектор осей и не более трёх подписей.
 *
 * Подпись ставится по правилу двух шкал: байесовская вероятность
 * практически заметного отклонения `p_ROPE = P(|δ| ≥ style_rope_delta)`
 * И частотный пол `z_raw ≥ style_z_raw` на сыром контрасте. Одной шкалы
 * мало: правило «|z| ≥ 0,8» помечает почти половину однородных менеджеров,
 * а одна `P(знак)` при типичных дефолтах срабатывает уже на отклонении
 * 0,13 σ — и то и другое даёт ярлыки там, где различий нет.
 *
 * Стиль не ранжирует людей: оба полюса оси нейтральны, порядка и мест нет.
 */

export {
    STYLE_PROFILE_DEFAULTS,
    type StyleAxisEstimate,
    type StyleConfidence,
    type StyleProfile,
    type StyleProfileOptions,
    type StyleRow,
    type StyleTag,
} from './style-profile.types';

/**
 * Процедура Бенджамини–Хохберга по осям пересчёта: ярус «похоже» без
 * контроля доли ложных открытий помечал бы каждую вторую ось.
 */
function bhPassed(axes: readonly StyleAxisEstimate[], q: number): Set<string> {
    const ordered = [...axes].sort(
        (a, b) => a.pRaw - b.pRaw || a.code.localeCompare(b.code),
    );
    const total = ordered.length;
    let cutoff = 0;
    ordered.forEach((axis, index) => {
        if (total > 0 && axis.pRaw <= (q * (index + 1)) / total) {
            cutoff = index + 1;
        }
    });
    return new Set(ordered.slice(0, cutoff).map(axis => axis.code));
}

interface TagContext extends StyleAxisContext {
    pIn: number;
    pOut: number;
    zRawFloor: number;
    maxTags: number;
    previousTags: readonly string[];
}

/**
 * Ярус подписи оси: «по данным», «похоже» или подписи нет. Гистерезис
 * (подпись прошлого окна при `p_ROPE ≥ style_p_out`) решается выше — так
 * профиль не мигает между пересчётами из-за одного разбора.
 */
function tierOf(
    axis: StyleAxisEstimate,
    pIn: number,
    context: TagContext,
    bh: ReadonlySet<string>,
): StyleTagTier | null {
    const strong =
        axis.pRope >= pIn &&
        Math.abs(axis.dTilde) >= context.ropeDelta &&
        axis.zRaw >= context.zRawFloor &&
        axis.n >= context.minCalls &&
        axis.peers >= context.minPeers &&
        axis.confidence.level === 'ok';
    if (strong) {
        return 'data';
    }
    const likely =
        axis.pRope >= 0.5 &&
        axis.n >= context.minLikely &&
        axis.peers >= STYLE_PROFILE_DEFAULTS.minPeersLikely &&
        bh.has(axis.code);
    return likely ? 'likely' : null;
}

const basisOf = (axis: StyleAxisEstimate): string =>
    `отклонение ${styleNumber(axis.dTilde)} разброса звонков ` +
    `(80 %-интервал ${styleNumber(axis.ci80[0])}…${styleNumber(axis.ci80[1])}), ` +
    `n = ${axis.n}, коллег ${axis.peers}, p = ${styleNumber(axis.pRope)}`;

function toTag(
    axis: StyleAxisEstimate,
    context: TagContext,
    bh: ReadonlySet<string>,
): StyleTag | null {
    const descriptor = styleTagFor(axis.code, axis.dTilde);
    if (descriptor === undefined || axis.confidence.level === 'none') {
        return null;
    }
    const kept =
        context.previousTags.includes(descriptor.code) &&
        axis.pRope >= context.pOut;
    const tier: StyleTagTier | null = kept
        ? 'data'
        : tierOf(axis, Math.max(descriptor.pIn, context.pIn), context, bh);
    if (tier === null) {
        return null;
    }
    return {
        code: descriptor.code,
        title: descriptor.title,
        axis: axis.code,
        tier,
        label: styleTagLabel(descriptor, {
            tier,
            n: axis.n,
            minN: context.minCalls,
            peers: axis.peers,
            unit: findStyleAxis(axis.code)?.unit ?? 'calls',
        }),
        basis: basisOf(axis),
        n: axis.n,
        pRope: axis.pRope,
        d: axis.dTilde,
        ci80: axis.ci80,
        kept,
    };
}

/** Подписи менеджера: по убыванию p_ROPE, не больше `maxTags`. */
function buildTags(
    axes: readonly StyleAxisEstimate[],
    context: TagContext,
): StyleTag[] {
    const bh = bhPassed(axes, STYLE_PROFILE_DEFAULTS.fdrQ);
    return axes
        .map(axis => toTag(axis, context, bh))
        .filter((tag): tag is StyleTag => tag !== null)
        .sort((a, b) => b.pRope - a.pRope || a.code.localeCompare(b.code))
        .slice(0, Math.max(0, context.maxTags));
}

/** Доверие профилю: мало разборов у менеджера или мало коллег в норме. */
function profileConfidence(
    calls: number,
    peers: number,
    minCalls: number,
    minPeers: number,
): StyleConfidence {
    const { fewCalls, fewPeers } = STYLE_CONFIDENCE_REASONS;
    if (calls < minCalls) {
        return { level: 'none', reason: fewCalls };
    }
    if (peers < STYLE_PROFILE_DEFAULTS.minPeersLikely) {
        return { level: 'none', reason: fewPeers };
    }
    return peers < minPeers
        ? { level: 'low', reason: fewPeers }
        : { level: 'ok' };
}

const axisContextOf = (options: StyleProfileOptions): StyleAxisContext => {
    const defaults = STYLE_PROFILE_DEFAULTS;
    const minCalls = options.minCalls ?? defaults.minCalls;
    return {
        minCalls,
        minLikely: Math.ceil(minCalls * defaults.likelyRatio),
        minPeers: options.minPeers ?? defaults.minPeers,
        peerMinCalls: options.peerMinCalls ?? defaults.peerMinCalls,
        ropeDelta: options.ropeDelta ?? defaults.ropeDelta,
        intervalZ: options.intervalZ ?? defaults.intervalZ,
        tenureKappa: options.tenureKappa ?? defaults.tenureKappa,
        bands: options.tenureBands ?? {},
    };
};

/**
 * Профиль стиля менеджера по строкам окна (его собственным и коллег).
 * Пороги приходят из реестра (`style_min_calls`, `style_min_peers`,
 * `style_rope_delta`, `style_p_in`, `style_p_out`, `style_z_raw`,
 * `style_interval_z`, `style_tenure_kappa`) и переопределяются опциями.
 *
 * При менее чем `style_min_calls` сравнимых разборов профиль отдаётся с
 * `confidence: none`, без подписей и без вектора: «данных пока мало»
 * честнее любой оценки. То же при менее чем пяти коллегах в норме —
 * сравнивать не с кем (режим малой команды, документ 3.7).
 */
export function buildStyleProfile(
    rows: readonly StyleRow[],
    managerId: string,
    options: StyleProfileOptions = {},
): StyleProfile {
    const defaults = STYLE_PROFILE_DEFAULTS;
    const context = axisContextOf(options);
    const axes = STYLE_AXES.map(axis =>
        estimateStyleAxis(rows, axis, managerId, context),
    ).filter((axis): axis is StyleAxisEstimate => axis !== null);
    const calls = rows.filter(row => row.managerId === managerId).length;
    const peers = axes.reduce((acc, axis) => Math.max(acc, axis.peers), 0);
    const confidence = profileConfidence(
        calls,
        peers,
        context.minCalls,
        context.minPeers,
    );
    const tags =
        confidence.level === 'none'
            ? []
            : buildTags(axes, {
                  ...context,
                  pIn: options.pIn ?? defaults.pIn,
                  pOut: options.pOut ?? defaults.pOut,
                  zRawFloor: options.zRaw ?? defaults.zRaw,
                  maxTags: options.maxTags ?? defaults.maxTags,
                  previousTags: options.previousTags ?? [],
              });
    return {
        managerId,
        calls,
        peers,
        vector:
            confidence.level === 'none'
                ? {}
                : Object.fromEntries(
                      axes
                          .filter(axis => axis.confidence.level !== 'none')
                          .map(axis => [axis.code, axis.dTilde] as const),
                  ),
        axes,
        tags,
        expectedFalseTags: tags.reduce((acc, tag) => acc + (1 - tag.pRope), 0),
        funnelShape: options.funnelShape ?? 'unknown',
        confidence,
    };
}
