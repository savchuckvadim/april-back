/**
 * Входы ступеней готовности L4/L5 (план §4.11, §10) для витрины: из
 * последних снапшотов точности прогноза и эффекта советов с флагами
 * портала либо, если их нет под рукой, из снимка ступеней в модели портала
 * (`readinessStages`, записан месячным пересчётом с флагами того момента).
 *
 * Правила перехода — только в библиотеке (`elevateReadiness`); здесь
 * выбор источника и структурная проверка чужой нагрузки (§5.4).
 * Чистые функции.
 */
import {
    AI_FORECAST_BACKTEST_STATUSES,
    RECOMMENDATION_GATE_STATUSES,
    readinessStageFlagsOf,
    readinessStagesFrom,
    type ParamContext,
    type ReadinessForecastStage,
    type ReadinessRecommendationsStage,
    type ReadinessStageFlags,
    type ReadinessStageGates,
    type ReadinessStages,
} from '@lib/sales-ai-analytics';
import { buildRegistryContext } from '@lib/sales-ai-analytics/settings/registry-context.builder';
import type { PortalModelView } from '../assembler/overview-model.types';
import type { Phase4LatestSnapshots } from '../loaders/phase4-snapshots.loader';
import type { AiAnalyticsPortalSettings } from '../loaders/settings.loader';

/** Снапшоты ступеней и флаги портала, прочитанные витриной. */
export interface ReadinessStageSources {
    readonly snapshots: Pick<
        Phase4LatestSnapshots,
        'forecastBacktest' | 'recommendationEffect'
    >;
    readonly flags: ReadinessStageFlags;
    /** Гейты ступеней портала; нет — дефолты реестра. */
    readonly gates?: ReadinessStageGates;
}

/**
 * Ступени из свежих снапшотов и действующих флагов портала; ни снапшотов,
 * ни флагов — null (Фаза 4 на портале не начиналась).
 */
export function stagesFromSources(
    sources: ReadinessStageSources,
): ReadinessStages | null {
    return readinessStagesFrom(
        sources.snapshots.forecastBacktest,
        sources.snapshots.recommendationEffect,
        sources.flags,
    );
}

/**
 * Слои реестра портала из уже загруженных настроек — те же, что собирает
 * `AiAnalyticsParamsLoader` (без слоя менеджера): флаги ступеней —
 * решение портала, а не менеджера.
 */
export function portalRegistryOf(
    settings: Pick<
        AiAnalyticsPortalSettings,
        'modelParams' | 'definitions' | 'targets'
    >,
): ParamContext {
    return buildRegistryContext({
        modelParams: settings.modelParams,
        definitions: settings.definitions,
        targets: settings.targets,
    });
}

/** Флаги ступеней портала по его настройкам. */
export const stageFlagsOf = (
    settings: Pick<
        AiAnalyticsPortalSettings,
        'modelParams' | 'definitions' | 'targets'
    >,
): ReadinessStageFlags => readinessStageFlagsOf(portalRegistryOf(settings));

const asRecord = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;

const oneOf = (allowed: readonly string[], value: unknown): boolean =>
    typeof value === 'string' && allowed.includes(value);

function forecastOf(value: unknown): ReadinessForecastStage | null {
    const stage = asRecord(value);
    if (
        stage === null ||
        typeof stage.stageEnabled !== 'boolean' ||
        typeof stage.shadowMonths !== 'number'
    ) {
        return null;
    }
    const backtest = asRecord(stage.backtest);
    const valid =
        backtest !== null &&
        oneOf(AI_FORECAST_BACKTEST_STATUSES, backtest.status) &&
        Array.isArray(backtest.reasons);

    return stage.backtest === null || valid
        ? (stage as unknown as ReadinessForecastStage)
        : null;
}

function recommendationsOf(
    value: unknown,
): ReadinessRecommendationsStage | null {
    const stage = asRecord(value);
    if (stage === null || typeof stage.stageEnabled !== 'boolean') return null;
    const effect = asRecord(stage.effect);
    const valid =
        effect !== null &&
        oneOf(RECOMMENDATION_GATE_STATUSES, effect.status) &&
        Array.isArray(effect.reasons);

    return stage.effect === null || valid
        ? (stage as unknown as ReadinessRecommendationsStage)
        : null;
}

/**
 * Снимок ступеней из модели портала; нет поля (старый снапшот) или форма
 * чужая — null, и режим остаётся по лестнице Фазы 2.
 */
export function modelReadinessStages(
    model: PortalModelView | null | undefined,
): ReadinessStages | null {
    const stages = asRecord(model?.readinessStages);
    if (stages === null) return null;
    const forecast = forecastOf(stages.forecast);

    return forecast === null
        ? null
        : {
              forecast,
              recommendations: recommendationsOf(stages.recommendations),
          };
}

const isGate = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * Гейты ступеней, с которыми модель портала считала свой режим: витрина
 * по снимку ступеней модели обязана судить по тем же порогам, что и
 * пересчёт (порог портала мог отличаться от дефолта реестра). Нет поля
 * (старый снапшот) или форма чужая — null, и берутся дефолты.
 */
export function modelReadinessStageGates(
    model: PortalModelView | null | undefined,
): ReadinessStageGates | null {
    const gates = asRecord(model?.readinessStageGates);

    return gates !== null &&
        isGate(gates.forecastShadowMonths) &&
        isGate(gates.recommendationsMinIssued) &&
        isGate(gates.recommendationsMinN)
        ? {
              forecastShadowMonths: gates.forecastShadowMonths,
              recommendationsMinIssued: gates.recommendationsMinIssued,
              recommendationsMinN: gates.recommendationsMinN,
          }
        : null;
}
