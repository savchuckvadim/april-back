/**
 * Сборка эффекта советов (план §4.10, §10 L5; поток B2b): выданные советы
 * месяца + реакции на них + рёбра воронки менеджера «до» и «после» →
 * вход библиотечного `buildRecommendationEffect` → нагрузка
 * `ai-analytics-recommendation-effect`.
 *
 * Рёбра берутся из месячных снапшотов менеджера: суммы `s` и `n` по
 * месяцам окна. Нет ни одного месяца «после» — окно не наблюдалось
 * (`after: null`), нет месяцев «до» — рёбер «до» нет, и такое окно в
 * сравнение не входит (библиотека сводит только общие рёбра).
 *
 * Чистые функции: без DI, Bitrix и `new Date()`.
 */
import {
    buildRecommendationEffect,
    type EdgeSamples,
    type GoodhartCleanInput,
    type IssuedRecommendation,
    type OutcomeSample,
    type RecommendationEffectParams,
    type AiLever,
    type RecommendationEffectSnapshot,
} from '@lib/sales-ai-analytics';
import type { AiSnapshotMeta } from './manager-snapshot.types';
import type { PortalManagerMonth } from './portal-model.types';

/** Выданный совет из журнала (структурно — запись стора журнала советов). */
export interface IssuedLeverFact {
    /** Объект записи `lever:{managerId}:{ключ}` — по нему ищутся реакции. */
    readonly object: string;
    readonly key: string;
    readonly lever: AiLever;
    readonly managerId: string;
    readonly monthKey: string;
}

/**
 * Рёбра менеджера за месяцы окна: суммы `s` и `n` по кодам `edges`.
 * null — у менеджера нет ни одного месяца окна.
 */
export function edgeSamplesOf(
    months: readonly PortalManagerMonth[],
    managerId: string,
    monthKeys: readonly string[],
    edges: readonly string[],
): EdgeSamples | null {
    const window = new Set(monthKeys);
    const own = months.filter(
        month => month.managerId === managerId && window.has(month.monthKey),
    );
    if (own.length === 0) return null;
    const sums = new Map<string, OutcomeSample>();
    for (const month of own) {
        for (const edge of month.edges) {
            if (!edges.includes(edge.edge)) continue;
            const current = sums.get(edge.edge) ?? { s: 0, n: 0 };
            sums.set(edge.edge, {
                s: current.s + edge.s,
                n: current.n + edge.n,
            });
        }
    }

    return Object.fromEntries(sums);
}

/** Вход сборки советов для библиотеки. */
export interface IssuedRecommendationsInput {
    readonly issued: readonly IssuedLeverFact[];
    readonly done: ReadonlySet<string>;
    readonly disagree: ReadonlySet<string>;
    readonly months: readonly PortalManagerMonth[];
    readonly beforeMonths: readonly string[];
    readonly afterMonths: readonly string[];
    readonly edges: readonly string[];
}

/** Выданные советы с реакциями и рёбрами «до/после». */
export function issuedRecommendationsOf(
    input: IssuedRecommendationsInput,
): IssuedRecommendation[] {
    return input.issued.map(item => ({
        key: item.key,
        lever: item.lever,
        managerId: item.managerId,
        monthKey: item.monthKey,
        done: input.done.has(item.object),
        disagree: input.disagree.has(item.object),
        before:
            edgeSamplesOf(
                input.months,
                item.managerId,
                input.beforeMonths,
                input.edges,
            ) ?? {},
        after: edgeSamplesOf(
            input.months,
            item.managerId,
            input.afterMonths,
            input.edges,
        ),
    }));
}

/** Вход сборки снапшота эффекта. */
export interface RecommendationEffectBuildInput {
    /** Месяц расчёта — ключ снапшота. */
    readonly monthKey: string;
    readonly issuedMonth: string;
    readonly issued: readonly IssuedRecommendation[];
    readonly params: RecommendationEffectParams;
    /** Флаги Гудхарта; null — трендов нет, контроль не применяется. */
    readonly goodhart: GoodhartCleanInput | null;
    readonly meta: AiSnapshotMeta;
}

/** Нагрузка `ai-analytics-recommendation-effect`. */
export function buildRecommendationEffectSnapshot(
    input: RecommendationEffectBuildInput,
): RecommendationEffectSnapshot {
    const effect = buildRecommendationEffect({
        issued: input.issued,
        params: input.params,
        ...(input.goodhart === null ? {} : { goodhart: input.goodhart }),
    });

    return {
        monthKey: input.monthKey,
        issuedMonths: [input.issuedMonth],
        issued: effect.issued,
        completedWindows: effect.completedWindows,
        done: effect.done,
        disagree: effect.disagree,
        doneShare: effect.doneShare,
        disagreeShare: effect.disagreeShare,
        byLever: effect.byLever,
        beforeAfter: effect.beforeAfter,
        gate: effect.gate,
        params: effect.params,
        goodhart: input.goodhart ?? { flags: 0, managersWithFlags: 0 },
        meta: input.meta,
    };
}
