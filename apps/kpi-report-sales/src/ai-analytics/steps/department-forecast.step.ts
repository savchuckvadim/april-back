/**
 * Шаг конвейера «прогноз отдела» (план §4.8, §10 L4; Фаза 4, поток B2b):
 * каждую ночь после прогноза менеджеров складывает их прогнозы дня в
 * вилку отдела и дописывает день в теневой журнал месяца
 * `ai-analytics-forecast-log` (portal-month, ключ — месяц, менеджера нет).
 *
 * Вилка — NegBin суммы остатков с φ модели портала и уровнем
 * `forecast_interval_level`; деньги — по логнормальному чеку модели (без
 * него — прайор реестра `check_lognormal_m/v`); простые базы — сумма
 * наивных прогнозов менеджеров и среднее продаж отдела за три
 * замороженных месяца. Журнал теневой: наружу вилка не идёт, пока бэктест
 * (`forecast-backtest`) не подтвердит точность.
 *
 * ⚠ Идемпотентность: журнал месяца читается и переписывается через
 * `upsert`, запись того же дня заменяется — повтор ночи даёт тот же
 * журнал. Факт месяца остаётся null до месячного бэктеста.
 *
 * `@Injectable` без bitrix-состояния: Битрикс не вызывается — прогнозы в
 * шине (или в `ais`), модель и месяцы менеджеров — в `ais`.
 */
import { Injectable } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    NEGBIN_DEFAULTS,
    resolveNumberParam,
    seedOf,
    type ForecastLogSnapshot,
} from '@lib/sales-ai-analytics';
import {
    AI_DEPARTMENT_FORECAST_RHYTHMS,
    AI_DEPARTMENT_FORECAST_STEP_CODE,
    AI_FORECAST_LOG_REASONS,
} from '../constants/ai-forecast-log.const';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import {
    buildForecastLogDay,
    managerPointOf,
    mergeForecastLog,
} from '../domain/assembler/department-forecast.assembler';
import type { PortalModelPayload } from '../domain/assembler/portal-model.types';
import { PortalModelLoader } from '../domain/loaders/portal-model.loader';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import {
    forecastLogsOf,
    mean3MonthKeys,
    mean3Of,
    modelFactsOf,
    rosterMonthSales,
} from './department-forecast.facts';
import { loadForecastDay } from './forecast-day.facts';
import type { ForecastDayBusEntry } from './forecast.step';
import type { PortalModelBusEntry } from './portal-model.step';
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
export class DepartmentForecastStep implements AiAnalyticsPipelineStep {
    readonly code = AI_DEPARTMENT_FORECAST_STEP_CODE;
    readonly rhythms = AI_DEPARTMENT_FORECAST_RHYTHMS;

    constructor(
        private readonly loader: PortalModelLoader,
        private readonly snapshots: AiAnalyticsSnapshotStore,
    ) {}

    async run(
        ctx: AiPipelineStepContext,
        bus: StepBus = createStepBus(),
    ): Promise<AiPipelineStepResult> {
        const startedAt = Date.now();
        if (ctx.managerIds.length === 0) {
            return stepSkipped(this.code, AI_FORECAST_LOG_REASONS.rosterEmpty, {
                ms: Date.now() - startedAt,
            });
        }
        const forecastDay = await loadForecastDay(ctx, bus, this.snapshots);
        if (forecastDay === null || forecastDay.managers.length === 0) {
            return stepSkipped(
                this.code,
                AI_FORECAST_LOG_REASONS.forecastDayMissing,
                { ms: Date.now() - startedAt },
            );
        }
        const payload = await this.buildLog(ctx, bus, forecastDay);
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
            rows: forecastDay.managers.length,
            written: result.written,
        });
    }

    /** Журнал месяца с днём прогона: день собирается и заменяет прежний. */
    private async buildLog(
        ctx: AiPipelineStepContext,
        bus: StepBus,
        forecastDay: ForecastDayBusEntry,
    ): Promise<ForecastLogSnapshot> {
        const roster = ctx.managerIds.map(String);
        const facts = modelFactsOf(await this.model(ctx, bus), ctx.registry);
        const meanKeys = mean3MonthKeys(ctx.day);
        const months = await this.loader.loadMonths(ctx.domain, meanKeys);
        const previous = await this.snapshots.findByKeys(
            ctx.domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.forecastLog,
            {
                periodKeys: [ctx.monthKey],
                managerIds: [null],
                latestOnly: true,
            },
        );
        const day = buildForecastLogDay({
            day: ctx.day,
            managers: forecastDay.managers.map(item =>
                managerPointOf(item.managerId, item.payload),
            ),
            phi: facts.phi,
            phiSource: facts.phiSource,
            level:
                resolveNumberParam('forecast_interval_level', ctx.registry) ??
                NEGBIN_DEFAULTS.level,
            check: facts.check,
            seed: seedOf(ctx.domain, ctx.day, ctx.calcVersion),
            mean3: mean3Of(rosterMonthSales(months, roster), meanKeys),
            modelSnapshotId: forecastDay.modelSnapshotId,
        });

        return mergeForecastLog({
            monthKey: ctx.monthKey,
            previous: forecastLogsOf(previous).get(ctx.monthKey) ?? null,
            day,
            checkSource: facts.check.source,
            meta: {
                calcVersion: ctx.calcVersion,
                paramsVersion: ctx.paramsVersion,
                comparableFrom: ctx.comparableFrom || null,
                generatedAt: ctx.now.toISOString(),
                modelSnapshotId: forecastDay.modelSnapshotId,
            },
        });
    }

    /**
     * Модель портала: из шины месячного шага либо из `ais` — с самым
     * поздним ЗАКРЫТЫМ месяцем (ключ раньше месяца прогона), а не
     * последняя записанная: после догона истории это был бы старый месяц.
     */
    private async model(
        ctx: AiPipelineStepContext,
        bus: StepBus,
    ): Promise<Partial<PortalModelPayload> | null> {
        const fromBus = bus.get<PortalModelBusEntry>(
            AI_PIPELINE_BUS_KEYS.portalModel,
        );
        if (typeof fromBus?.payload === 'object' && fromBus.payload !== null) {
            return fromBus.payload as Partial<PortalModelPayload>;
        }
        const record = await this.loader.latestModel(ctx.domain, ctx.monthKey);

        return record?.payload ?? null;
    }
}
