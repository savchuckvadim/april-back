/**
 * Шаг конвейера «воспроизведение теневого журнала прогноза» (план §10 L4;
 * задача «прогноз отдела быстрее», 19.10.2026): по закрытому месяцу M
 * для каждого его рабочего дня d считает прогноз отдела так, как он был
 * бы посчитан в ночь на d — только по данным, известным к d, — и
 * дописывает дни в `ai-analytics-forecast-log` с пометкой `replayed`.
 * Так бэктесту (`forecast-backtest`, идёт следом) не нужно ждать
 * `forecast_shadow_min_months` живых месяцев.
 *
 * Входы на день d: модель портала с закрытым месяцем раньше M
 * (`latestModel(domain, M)`), продажи по дате закрытия сделок (кэш
 * sales-finance), открытые эпизоды из шины `episodes` с границами, темп
 * прошлого месяца, факт прошлого месяца и простое среднее из `ais`.
 *
 * ⚠ Правила. Живые дни ночного журнала не затираются: восстанавливаются
 * только дни раньше первого живого. Месяц прогона и будущее не трогаются.
 * Идемпотентен: `upsert` журнала месяца, `forceRefresh` переписывает.
 * Необязательный: сбой не рвёт прогон (раннер пишет пропуск с причиной).
 * Без шины истории стадий (ручной пересчёт одним шагом) пайплайн — null
 * с причиной, как у живого прогноза, а не ноль.
 *
 * `@Injectable` без bitrix-состояния: Битрикс (точнее, кэш закрытых
 * месяцев) трогает только загрузчик дней закрытия.
 */
import { Injectable } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    enumerateWorkdays,
    type ForecastLogSnapshot,
} from '@lib/sales-ai-analytics';
import {
    AI_FORECAST_LOG_REASONS,
    AI_FORECAST_LOG_REPLAY_MONTHS,
    AI_FORECAST_LOG_REPLAY_RHYTHMS,
    AI_FORECAST_LOG_REPLAY_STEP_CODE,
} from '../constants/ai-forecast-log.const';
import {
    monthBounds,
    monthKeysBack,
} from '../constants/ai-manager-snapshot.const';
import { AI_PORTAL_MODEL_REASONS } from '../constants/ai-portal-model.const';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import { AI_STAGE_HISTORY_MIN_MONTHS } from '../constants/ai-stage-history.const';
import { ClosedSalesDaysLoader } from '../domain/loaders/closed-sales-days.loader';
import { PortalModelLoader } from '../domain/loaders/portal-model.loader';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import { forecastLogsOf, rosterMonthSales } from './department-forecast.facts';
import { buildReplayLog } from './forecast-log-replay.days';
import {
    isMonthClosed,
    replayDaysOf,
    replayEpisodesOf,
    replayModelOf,
} from './forecast-log-replay.facts';
import { busNumber, managerByEpisodeKey } from './portal-model.facts';
import {
    AiAnalyticsPipelineStep,
    AiPipelineStepContext,
    AiPipelineStepResult,
    createStepBus,
    StepBus,
    stepOk,
    stepSkipped,
} from './step.types';

@Injectable()
export class ForecastLogReplayStep implements AiAnalyticsPipelineStep {
    readonly code = AI_FORECAST_LOG_REPLAY_STEP_CODE;
    readonly rhythms = AI_FORECAST_LOG_REPLAY_RHYTHMS;
    /** Теневой шаг: сбой источника не обрывает прогон (раннер — пропуск). */
    readonly optional = true;

    constructor(
        private readonly loader: PortalModelLoader,
        private readonly snapshots: AiAnalyticsSnapshotStore,
        private readonly closedSales: ClosedSalesDaysLoader,
    ) {}

    async run(
        ctx: AiPipelineStepContext,
        bus: StepBus = createStepBus(),
    ): Promise<AiPipelineStepResult> {
        const startedAt = Date.now();
        const skip = (reason: string): AiPipelineStepResult =>
            stepSkipped(this.code, reason, { ms: Date.now() - startedAt });
        if (ctx.managerIds.length === 0) {
            return skip(AI_FORECAST_LOG_REASONS.rosterEmpty);
        }
        if (!isMonthClosed(ctx.monthKey, ctx.now, ctx.timeZone)) {
            return skip(AI_FORECAST_LOG_REASONS.replayMonthOpen);
        }
        const model = replayModelOf(
            await this.loader.latestModel(ctx.domain, ctx.monthKey),
        );
        if (model === null) return skip(AI_PORTAL_MODEL_REASONS.modelMissing);
        const months = await this.loader.loadMonths(
            ctx.domain,
            monthKeysBack(ctx.monthKey, AI_FORECAST_LOG_REPLAY_MONTHS),
        );
        if (!months.some(month => month.monthKey === ctx.monthKey)) {
            return skip(AI_PORTAL_MODEL_REASONS.monthMissing);
        }
        const previous = await this.previousLog(ctx);
        const bounds = monthBounds(ctx.monthKey);
        const workdays = enumerateWorkdays(
            bounds.from,
            bounds.to,
            ctx.calendar,
        );
        const days = replayDaysOf(previous, workdays);
        if (days.length === 0) {
            return skip(AI_FORECAST_LOG_REASONS.replayNothingToDo);
        }
        const closeDays = await this.closedSales.load(
            ctx.domain,
            bounds.from,
            bounds.to,
            ctx.managerIds,
            { forceRefresh: ctx.forceRefresh },
        );
        const roster = ctx.managerIds.map(String);
        const historyMonths =
            busNumber(bus.get(AI_PIPELINE_BUS_KEYS.historyMonths)) ?? 0;
        const payload = buildReplayLog({
            domain: ctx.domain,
            monthKey: ctx.monthKey,
            timeZone: ctx.timeZone,
            calendar: ctx.calendar,
            workdays,
            days,
            roster,
            model,
            months,
            closeDays,
            episodes: replayEpisodesOf(bus.get(AI_PIPELINE_BUS_KEYS.episodes)),
            managerByEpisodeKey: managerByEpisodeKey(
                bus.get(AI_PIPELINE_BUS_KEYS.chain),
                bus.get(AI_PIPELINE_BUS_KEYS.callsRows),
            ),
            // Тот же гейт, что у шага истории стадий и живого прогноза.
            hasStageHistory: historyMonths >= AI_STAGE_HISTORY_MIN_MONTHS,
            registry: ctx.registry,
            targets: ctx.settings.targets,
            calcVersion: ctx.calcVersion,
            previous,
            // Факт месяца — как его ставит бэктест: сумма продаж ростера.
            actual: rosterMonthSales(months, roster).get(ctx.monthKey) ?? null,
            meta: {
                calcVersion: ctx.calcVersion,
                paramsVersion: ctx.paramsVersion,
                comparableFrom: ctx.comparableFrom || null,
                generatedAt: ctx.now.toISOString(),
                modelSnapshotId: model.id,
            },
        });
        const result = await this.snapshots.upsert(
            {
                domain: ctx.domain,
                type: AI_ANALYTICS_SNAPSHOT_TYPE.forecastLog,
                periodKey: ctx.monthKey,
                managerId: null,
                calcVersion: ctx.calcVersion,
                paramsVersion: ctx.paramsVersion,
                inputsHash: ctx.inputsHash,
                generatedAt: ctx.now.toISOString(),
                payload,
            },
            { force: ctx.forceRefresh },
        );

        return stepOk(this.code, {
            ms: Date.now() - startedAt,
            rows: days.length,
            written: result.written,
        });
    }

    /** Журнал месяца прогона из `ais`; null — журнала ещё нет. */
    private async previousLog(
        ctx: AiPipelineStepContext,
    ): Promise<ForecastLogSnapshot | null> {
        const records = await this.snapshots.findByKeys(
            ctx.domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.forecastLog,
            {
                periodKeys: [ctx.monthKey],
                managerIds: [null],
                latestOnly: true,
            },
        );

        return forecastLogsOf(records).get(ctx.monthKey) ?? null;
    }
}
