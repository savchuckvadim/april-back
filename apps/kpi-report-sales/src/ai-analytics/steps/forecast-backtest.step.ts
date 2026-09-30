/**
 * Шаг конвейера «точность прогноза отдела» (план §10 L4; Фаза 4, поток
 * B2b): раз в месяц по ЗАКРЫТОМУ месяцу (месячный ритм считает
 * предыдущий месяц, догон истории — месяц джобы).
 *
 * (а) Ставит факт продаж в теневой журнал закрытого месяца — сумма
 * `salesCount` замороженных месячных снапшотов менеджеров ростера.
 * (б) Собирает журналы 12 последних месяцев с фактом и прогоняет
 * rolling-origin бэктест библиотеки (`backtestForecast`, seed —
 * `seedOf(domain, monthKey, calcVersion)`).
 * (в) Пишет `ai-analytics-forecast-backtest` (portal-month, ключ — закрытый
 * месяц): статус, метрики, число теневых месяцев и причины.
 *
 * Без журнала закрытого месяца или без его факта шаг пропускается с
 * причиной и ничего не пишет: иначе поздний догон старого месяца
 * заслонил бы свежий бэктест.
 *
 * ⚠ Идемпотентность: обе записи — `upsert` по ключу месяца; повтор с той
 * же сигнатурой ничего не пишет, пересчёт даёт тот же результат (seed
 * детерминирован).
 *
 * `@Injectable` без bitrix-состояния: всё читается из `ais`.
 */
import { Injectable } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    seedOf,
    type SnapshotEnvelope,
} from '@lib/sales-ai-analytics';
import {
    AI_FORECAST_BACKTEST_RHYTHMS,
    AI_FORECAST_BACKTEST_STEP_CODE,
    AI_FORECAST_BACKTEST_WINDOW_MONTHS,
    AI_FORECAST_LOG_REASONS,
} from '../constants/ai-forecast-log.const';
import { monthKeysBack } from '../constants/ai-manager-snapshot.const';
import { withActual } from '../domain/assembler/department-forecast.assembler';
import type { AiSnapshotMeta } from '../domain/assembler/manager-snapshot.types';
import { PortalModelLoader } from '../domain/loaders/portal-model.loader';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import { forecastLogsOf, rosterMonthSales } from './department-forecast.facts';
import {
    backtestParamsOf,
    buildBacktestSnapshot,
} from './forecast-backtest.facts';
import {
    AiAnalyticsPipelineStep,
    AiPipelineStepContext,
    AiPipelineStepResult,
    stepOk,
    stepSkipped,
} from './step.types';

@Injectable()
export class ForecastBacktestStep implements AiAnalyticsPipelineStep {
    readonly code = AI_FORECAST_BACKTEST_STEP_CODE;
    readonly rhythms = AI_FORECAST_BACKTEST_RHYTHMS;
    /** Теневой шаг: сбой источника не обрывает прогон (раннер — пропуск). */
    readonly optional = true;

    constructor(
        private readonly loader: PortalModelLoader,
        private readonly snapshots: AiAnalyticsSnapshotStore,
    ) {}

    async run(ctx: AiPipelineStepContext): Promise<AiPipelineStepResult> {
        const startedAt = Date.now();
        const skip = (reason: string): AiPipelineStepResult =>
            stepSkipped(this.code, reason, { ms: Date.now() - startedAt });
        if (ctx.managerIds.length === 0) {
            return skip(AI_FORECAST_LOG_REASONS.rosterEmpty);
        }
        const records = await this.snapshots.findByKeys(
            ctx.domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.forecastLog,
            {
                periodKeys: monthKeysBack(
                    ctx.monthKey,
                    AI_FORECAST_BACKTEST_WINDOW_MONTHS,
                ),
                managerIds: [null],
                latestOnly: true,
            },
        );
        const logs = forecastLogsOf(records);
        const current = logs.get(ctx.monthKey);
        if (current === undefined) {
            return skip(AI_FORECAST_LOG_REASONS.logMissing);
        }
        const months = await this.loader.loadMonths(ctx.domain, [ctx.monthKey]);
        const actual = rosterMonthSales(months, ctx.managerIds.map(String)).get(
            ctx.monthKey,
        );
        if (actual === undefined) {
            return skip(AI_FORECAST_LOG_REASONS.actualMissing);
        }
        const meta = this.meta(ctx);
        // Журнал сохраняет модель, по которой считались его дни.
        const closed = withActual(current, actual, {
            ...meta,
            modelSnapshotId: current.meta.modelSnapshotId ?? null,
        });
        logs.set(ctx.monthKey, closed);
        const logWrite = await this.snapshots.upsert(
            this.envelope(ctx, AI_ANALYTICS_SNAPSHOT_TYPE.forecastLog, closed),
            { force: ctx.forceRefresh },
        );
        const snapshot = buildBacktestSnapshot({
            monthKey: ctx.monthKey,
            logs,
            params: backtestParamsOf(ctx.registry),
            seed: seedOf(ctx.domain, ctx.monthKey, ctx.calcVersion),
            meta,
        });
        const backtestWrite = await this.snapshots.upsert(
            this.envelope(
                ctx,
                AI_ANALYTICS_SNAPSHOT_TYPE.forecastBacktest,
                snapshot,
            ),
            { force: ctx.forceRefresh },
        );

        return stepOk(this.code, {
            ms: Date.now() - startedAt,
            rows: logs.size,
            written: logWrite.written + backtestWrite.written,
        });
    }

    private meta(ctx: AiPipelineStepContext): AiSnapshotMeta {
        return {
            calcVersion: ctx.calcVersion,
            paramsVersion: ctx.paramsVersion,
            comparableFrom: ctx.comparableFrom || null,
            generatedAt: ctx.now.toISOString(),
            modelSnapshotId: null,
        };
    }

    /** Конверт портальной записи закрытого месяца. */
    private envelope<T>(
        ctx: AiPipelineStepContext,
        type: SnapshotEnvelope<T>['type'],
        payload: T,
    ): SnapshotEnvelope<T> {
        return {
            domain: ctx.domain,
            type,
            periodKey: ctx.monthKey,
            managerId: null,
            calcVersion: ctx.calcVersion,
            paramsVersion: ctx.paramsVersion,
            inputsHash: ctx.inputsHash,
            generatedAt: ctx.now.toISOString(),
            payload,
        };
    }
}
