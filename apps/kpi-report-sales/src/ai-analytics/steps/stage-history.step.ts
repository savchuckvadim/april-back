/**
 * Шаг конвейера «история стадий» (план Фазы 2, поток 13 «p2-stage-history»,
 * закрывает P2-47 и прикладную часть P2-07/P2-08/P2-22, гейт `rate → prob`).
 *
 * Порядок: выгрузка истории окнами → сущности звонков из `ais` → сборка
 * эпизодов, сцепки, стадийных θ, фактов сроков, лагов и плацебо-теста →
 * раскладка результатов по шине для модели портала и прогноза.
 *
 * ⚠ Штатная деградация (§5.4). Нет прав на `crm.stagehistory.list`, не
 * настроена воронка или история короче трёх месяцев — шаг возвращает
 * `skipped` с причиной, а НЕ падает: журнал прогона получает «частично»,
 * прогноз отдаёт `pipelineExpected = null` (по `historyMonths` в шине),
 * рёбра остаются в трактовке интенсивности.
 * ⚠ Идемпотентность: шаг снапшотов не пишет, а повтор за тот же день читает
 * окно истории из кэша — вызовы Битрикса не удваиваются.
 */
import { Injectable } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    resolveNumberParam,
    type AiEdgeEstimand,
    type ShrinkPrior,
} from '@lib/sales-ai-analytics';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import {
    AI_STAGE_HISTORY_MIN_MONTHS,
    AI_STAGE_HISTORY_RHYTHMS,
    AI_STAGE_HISTORY_SKIP_REASONS,
    AI_STAGE_HISTORY_STEP_CODE,
    AI_STAGE_HISTORY_WINDOW_MONTHS,
    stageHistoryFromDate,
} from '../constants/ai-stage-history.const';
import {
    assembleEpisodes,
    historyDepthMonths,
    type EpisodesAssembly,
} from '../domain/assembler/episodes.assembler';
import { CallEntityLoader } from '../domain/loaders/call-entity.loader';
import {
    StageHistoryLoader,
    type StageHistoryResult,
} from '../domain/loaders/stage-history.loader';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import {
    previousEstimandOf,
    stageHistoryCallFacts,
    toCallsForLink,
} from './stage-history.facts';
import {
    type AiAnalyticsPipelineStep,
    type AiPipelineStepContext,
    type AiPipelineStepResult,
    type StepBus,
    stepOk,
    stepSkipped,
} from './step.types';

@Injectable()
export class StageHistoryStep implements AiAnalyticsPipelineStep {
    readonly code = AI_STAGE_HISTORY_STEP_CODE;
    readonly rhythms = AI_STAGE_HISTORY_RHYTHMS;

    constructor(
        private readonly history: StageHistoryLoader,
        private readonly callEntities: CallEntityLoader,
        private readonly snapshots: AiAnalyticsSnapshotStore,
    ) {}

    async run(
        ctx: AiPipelineStepContext,
        bus: StepBus,
    ): Promise<AiPipelineStepResult> {
        const startedAt = Date.now();
        const loaded = await this.history.load(ctx.domain, {
            fromDate: stageHistoryFromDate(
                ctx.day,
                AI_STAGE_HISTORY_WINDOW_MONTHS,
            ),
            toDate: ctx.day,
            forceRefresh: ctx.forceRefresh,
        });
        if (!loaded.ok) {
            bus.set(AI_PIPELINE_BUS_KEYS.historyMonths, 0);

            return this.skipped(
                loaded,
                startedAt,
                loaded.reason ?? AI_STAGE_HISTORY_SKIP_REASONS.unavailable,
            );
        }
        const historyMonths = historyDepthMonths(loaded.transitions);
        bus.set(AI_PIPELINE_BUS_KEYS.historyMonths, historyMonths);
        if (historyMonths < AI_STAGE_HISTORY_MIN_MONTHS) {
            // Гейт до сборки: на короткой истории ни эпизоды, ни сцепка не
            // нужны — незачем ходить в ais за сущностями звонков.
            return this.skipped(
                loaded,
                startedAt,
                AI_STAGE_HISTORY_SKIP_REASONS.tooShort,
            );
        }
        this.publish(bus, await this.assemble(ctx, loaded, bus));

        return stepOk(this.code, this.values(loaded, startedAt));
    }

    /** Сборка эпизодов: звонки шины + сущности `ais` + слои реестра. */
    private async assemble(
        ctx: AiPipelineStepContext,
        loaded: StageHistoryResult,
        bus: StepBus,
    ): Promise<EpisodesAssembly> {
        const facts = stageHistoryCallFacts(
            bus.get(AI_PIPELINE_BUS_KEYS.callsRows),
        );
        const refs = await this.callEntities.load(
            ctx.domain,
            facts.map(fact => fact.transcriptionId),
        );
        const minSales = resolveNumberParam('n_min_none', ctx.registry);
        const prior = this.prior(ctx);

        return assembleEpisodes({
            transitions: loaded.transitions,
            calls: toCallsForLink(facts, refs),
            now: ctx.now.toISOString(),
            ...(await this.hysteresis(ctx)),
            ...(prior === undefined ? {} : { prior }),
            ...(minSales === undefined ? {} : { minSales }),
            ...cycleMedianDefault(ctx),
        });
    }

    /**
     * Гистерезис трактовки ребра: пороги из реестра (`deal_chain_min_pct`
     * 80 на вход, `deal_chain_exit_pct` 70 на выход), текущая трактовка —
     * из последнего снапшота модели портала. Переключение только вперёд,
     * поэтому без прошлой трактовки портал стартует с интенсивности.
     */
    private async hysteresis(ctx: AiPipelineStepContext): Promise<{
        currentEstimand?: AiEdgeEstimand;
        enterPct?: number;
        exitPct?: number;
    }> {
        const record = await this.snapshots.latest(
            ctx.domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.portalModel,
            null,
        );
        const currentEstimand = previousEstimandOf(record?.payload);
        const enterPct = resolveNumberParam('deal_chain_min_pct', ctx.registry);
        const exitPct = resolveNumberParam('deal_chain_exit_pct', ctx.registry);

        return {
            ...(currentEstimand ? { currentEstimand } : {}),
            ...(enterPct === undefined ? {} : { enterPct }),
            ...(exitPct === undefined ? {} : { exitPct }),
        };
    }

    /**
     * Норма слоя стадийных θ: μ придёт из модели портала следующим шагом,
     * поэтому здесь берётся только сила усадки κ поздних рёбер реестра.
     */
    private prior(ctx: AiPipelineStepContext): ShrinkPrior | undefined {
        const kappa = resolveNumberParam('kappa_edge_late', ctx.registry);

        return kappa === undefined ? undefined : { mu: 0, kappa };
    }

    /** Результаты шага в шину: их читают модель портала и прогноз. */
    private publish(bus: StepBus, assembly: EpisodesAssembly): void {
        bus.set(AI_PIPELINE_BUS_KEYS.episodes, assembly.episodes);
        bus.set(AI_PIPELINE_BUS_KEYS.chain, assembly.chain);
        bus.set(AI_PIPELINE_BUS_KEYS.stageTheta, assembly.stageThetas);
        bus.set(AI_PIPELINE_BUS_KEYS.cycleMedian, assembly.cycleMedianDays);
        bus.set(AI_PIPELINE_BUS_KEYS.slaFacts, assembly.slaFacts);
        bus.set(AI_PIPELINE_BUS_KEYS.timestampLeak, assembly.leak);
    }

    /** Пропуск с причиной: журнал получает «частично», прогон продолжается. */
    private skipped(
        loaded: StageHistoryResult,
        startedAt: number,
        reason: string,
    ): AiPipelineStepResult {
        return stepSkipped(this.code, reason, this.values(loaded, startedAt));
    }

    /** Объёмы шага для журнала прогона: строки, вызовы, снапшоты. */
    private values(
        loaded: StageHistoryResult,
        startedAt: number,
    ): Pick<AiPipelineStepResult, 'ms' | 'rows' | 'bitrixCalls' | 'written'> {
        return {
            ms: Date.now() - startedAt,
            rows: loaded.rows,
            bitrixCalls: loaded.bitrixCalls,
            written: 0,
        };
    }
}

/** Медиана цикла из реестра — запасное значение до гейта по продажам. */
function cycleMedianDefault(ctx: AiPipelineStepContext): {
    cycleMedianDefault?: number;
} {
    const value = resolveNumberParam('cycle_median_days', ctx.registry);

    return value === undefined ? {} : { cycleMedianDefault: value };
}
