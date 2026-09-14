/**
 * Шаг конвейера «прогноз дня» (план Фазы 2, §4.8–§4.10, поток 16a):
 * каждую ночь по каждому менеджеру пишется `ai-analytics-forecast` —
 * срединная оценка месяца, наивные базы, ожидание от открытого
 * пайплайна с причиной при его отсутствии, план дня, рычаги и утечки.
 *
 * Модель портала берётся из шины (`portalModel`), а если её там нет —
 * последней записанной из `ais`; её идентификатор проставляется в
 * `meta.modelSnapshotId`, иначе пересчёт не воспроизвёл бы день,
 * посчитанный по прошлой модели (§3.1).
 *
 * ⚠ Штатная деградация: без истории стадий `pipelineExpected` равен
 * `null` С ПРИЧИНОЙ, а не нулю — ноль означал бы «пайплайн пуст».
 *
 * `@Injectable` без bitrix-состояния: Битрикс не вызывается — все входы
 * уже лежат в `ais` и в шине прогона.
 */
import { Injectable } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    seedOf,
    type PipelineEpisode,
} from '@lib/sales-ai-analytics';

import {
    AI_FORECAST_RHYTHMS,
    AI_FORECAST_STEP_CODE,
    AI_PORTAL_MODEL_REASONS,
} from '../constants/ai-portal-model.const';
import {
    AI_PIPELINE_BUS_KEYS,
    previousMonthKey,
} from '../constants/ai-snapshot.const';
import { AI_STAGE_HISTORY_MIN_MONTHS } from '../constants/ai-stage-history.const';
import {
    buildForecastPayload,
    type ForecastPayload,
} from '../domain/assembler/forecast.assembler';
import type {
    PortalManagerMonth,
    PortalModelPayload,
} from '../domain/assembler/portal-model.types';
import {
    PortalModelLoader,
    type PortalModelRecord,
} from '../domain/loaders/portal-model.loader';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import {
    busNumber,
    managerByEpisodeKey,
    openEpisodesOf,
} from './portal-model.facts';
import { managerInput, workdaysOf } from './forecast.facts';
import type { PortalModelBusEntry } from './portal-model.step';
import {
    AiAnalyticsPipelineStep,
    AiPipelineStepContext,
    AiPipelineStepResult,
    StepBus,
    stepOk,
    stepSkipped,
} from './step.types';

/** Предыдущий месяц по ключу месяца ('2026-09' → '2026-08'). */
const previousMonthOf = (monthKey: string): string =>
    previousMonthKey(`${monthKey}-01`);

@Injectable()
export class ForecastStep implements AiAnalyticsPipelineStep {
    readonly code = AI_FORECAST_STEP_CODE;
    readonly rhythms = AI_FORECAST_RHYTHMS;

    constructor(
        private readonly loader: PortalModelLoader,
        private readonly snapshots: AiAnalyticsSnapshotStore,
    ) {}

    async run(
        ctx: AiPipelineStepContext,
        bus: StepBus,
    ): Promise<AiPipelineStepResult> {
        const startedAt = Date.now();
        if (ctx.managerIds.length === 0) {
            return stepSkipped(this.code, AI_PORTAL_MODEL_REASONS.rosterEmpty, {
                ms: Date.now() - startedAt,
            });
        }
        const model = await this.model(ctx, bus);
        if (model === null) {
            return stepSkipped(
                this.code,
                AI_PORTAL_MODEL_REASONS.modelMissing,
                { ms: Date.now() - startedAt },
            );
        }
        const months = await this.loader.loadMonths(ctx.domain, [
            previousMonthOf(ctx.monthKey),
            ctx.monthKey,
        ]);
        if (months.length === 0) {
            return stepSkipped(
                this.code,
                AI_PORTAL_MODEL_REASONS.monthMissing,
                {
                    ms: Date.now() - startedAt,
                },
            );
        }
        const written = await this.writeAll(ctx, bus, model, months);

        return stepOk(this.code, {
            ms: Date.now() - startedAt,
            rows: months.length,
            written,
        });
    }

    /** Модель портала: из шины месячного шага либо последняя из `ais`. */
    private async model(
        ctx: AiPipelineStepContext,
        bus: StepBus,
    ): Promise<{ id: string | null; payload: PortalModelPayload } | null> {
        const fromBus = bus.get<PortalModelBusEntry>(
            AI_PIPELINE_BUS_KEYS.portalModel,
        );
        const payload = (fromBus?.payload ?? null) as PortalModelPayload | null;
        if (payload !== null && Array.isArray(payload.edges)) {
            return { id: fromBus?.id ?? null, payload };
        }
        const record = await this.loader.latestModel(ctx.domain);

        return isModel(record)
            ? { id: record.id, payload: record.payload as PortalModelPayload }
            : null;
    }

    /** Прогноз по каждому менеджеру ростера и запись снапшотов. */
    private async writeAll(
        ctx: AiPipelineStepContext,
        bus: StepBus,
        model: { id: string | null; payload: PortalModelPayload },
        months: readonly PortalManagerMonth[],
    ): Promise<number> {
        const days = workdaysOf(ctx);
        const historyMonths =
            busNumber(bus.get(AI_PIPELINE_BUS_KEYS.historyMonths)) ?? 0;
        const episodes = this.episodesByManager(bus, model.payload);
        const previousMonth = previousMonthOf(ctx.monthKey);
        let written = 0;
        for (const managerId of ctx.managerIds.map(String)) {
            const payload = buildForecastPayload({
                day: ctx.day,
                monthKey: ctx.monthKey,
                workdaysInMonth: days.total,
                daysElapsed: days.elapsed,
                daysLeft: days.left,
                model: model.payload,
                modelSnapshotId: model.id,
                // Тот же гейт, что у шага истории стадий (аудит N3): ниже
                // него шаг сам уходит в skipped и пайплайна в шине нет.
                hasStageHistory: historyMonths >= AI_STAGE_HISTORY_MIN_MONTHS,
                registry: ctx.registry,
                manager: managerInput({
                    managerId,
                    months,
                    monthKey: ctx.monthKey,
                    previousMonth,
                    openEpisodes: episodes.get(managerId) ?? [],
                    model: model.payload,
                    targets: ctx.settings.targets,
                }),
                seed: seedOf(ctx.domain, managerId, ctx.day, ctx.calcVersion),
                meta: {
                    calcVersion: ctx.calcVersion,
                    paramsVersion: ctx.paramsVersion,
                    comparableFrom: ctx.comparableFrom || null,
                    generatedAt: ctx.now.toISOString(),
                    modelSnapshotId: model.id,
                },
            });
            await this.write(ctx, managerId, payload);
            written += 1;
        }

        return written;
    }

    /** Открытые эпизоды по менеджерам: сцепка звонков + стадийные θ. */
    private episodesByManager(
        bus: StepBus,
        model: PortalModelPayload,
    ): Map<string, PipelineEpisode[]> {
        const byKey = managerByEpisodeKey(
            bus.get(AI_PIPELINE_BUS_KEYS.chain),
            bus.get(AI_PIPELINE_BUS_KEYS.callsRows),
        );
        const theta = new Map(
            model.stageTheta.map(stage => [stage.stageCode, stage.value]),
        );
        const found = new Map<string, PipelineEpisode[]>();
        for (const episode of openEpisodesOf(
            bus.get(AI_PIPELINE_BUS_KEYS.episodes),
        )) {
            const managerId = byKey.get(episode.key);
            if (managerId === undefined) continue;
            found.set(managerId, [
                ...(found.get(managerId) ?? []),
                {
                    id: episode.key,
                    ageDays: episode.ageDays,
                    theta: theta.get(episode.stageCode) ?? 0,
                },
            ]);
        }

        return found;
    }

    private async write(
        ctx: AiPipelineStepContext,
        managerId: string,
        payload: ForecastPayload,
    ): Promise<void> {
        await this.snapshots.upsert({
            domain: ctx.domain,
            type: AI_ANALYTICS_SNAPSHOT_TYPE.forecast,
            periodKey: ctx.day,
            managerId,
            calcVersion: ctx.calcVersion,
            paramsVersion: ctx.paramsVersion,
            inputsHash: ctx.inputsHash,
            generatedAt: ctx.now.toISOString(),
            payload,
        });
    }
}

/** Запись модели пригодна: нагрузка есть и в ней есть рёбра. */
function isModel(
    record: PortalModelRecord | null,
): record is PortalModelRecord {
    return record !== null && Array.isArray(record.payload.edges);
}
