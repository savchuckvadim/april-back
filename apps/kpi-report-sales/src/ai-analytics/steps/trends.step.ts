/**
 * Шаг конвейера «тренды» (план Фазы 3, поток П1): по закончившейся
 * ISO-неделе читает недельные снапшоты менеджеров за полгода и закрытые
 * месяцы за год, нормализует ряды по разрывам, калибрует пороги сдвига и
 * дрейфа по семейству менеджеров × метрик (FWER ≤ `trend_fwer`) и пишет
 * `ai-analytics-trends` по каждому менеджеру с достаточным числом
 * разборов (`trend_window_calls`).
 *
 * Битрикс не вызывается: все входы уже лежат в `ais`. Идёт ПОСЛЕ шага
 * `calls` того же недельного прогона — тот только что записал неделю.
 * Идемпотентен: та же неделя при повторе прогона перезаписывается через
 * `upsert` (прошлая запись → superseded).
 *
 * `@Injectable` без bitrix-состояния.
 */
import { Injectable } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT,
    seedOf,
} from '@lib/sales-ai-analytics';
import { monthKeysBack } from '../constants/ai-manager-snapshot.const';
import { previousMonthKey } from '../constants/ai-snapshot.const';
import {
    AI_TREND_MONTHS_WINDOW,
    AI_TREND_REASONS,
    AI_TREND_STEP_CODE,
    AI_TREND_STEP_RHYTHMS,
    AI_TREND_WEEKS_WINDOW,
    trendWeekKeys,
} from '../constants/ai-trend.const';
import {
    buildTrendsPayload,
    trendParamsOf,
} from '../domain/assembler/trends.assembler';
import type { TrendSnapshotRecord } from '../domain/assembler/trends.series';
import type { ManagerTrendsPayload } from '../domain/assembler/trends.types';
import {
    AiAnalyticsSnapshotStore,
    type AiAnalyticsSnapshotRecord,
} from '../store/ai-analytics-snapshot.store';
import {
    AiAnalyticsPipelineStep,
    AiPipelineStepContext,
    AiPipelineStepResult,
    stepOk,
    stepSkipped,
} from './step.types';

/** Записи менеджеров ростера в форме рядов (портальные маркеры отброшены). */
export function trendRecordsOf(
    records: readonly AiAnalyticsSnapshotRecord[],
    managerIds: ReadonlySet<string>,
): TrendSnapshotRecord[] {
    return records.flatMap(record =>
        record.managerId !== null && managerIds.has(record.managerId)
            ? [
                  {
                      periodKey: record.periodKey,
                      managerId: record.managerId,
                      payload: record.payload,
                  },
              ]
            : [],
    );
}

@Injectable()
export class TrendsStep implements AiAnalyticsPipelineStep {
    readonly code = AI_TREND_STEP_CODE;
    readonly rhythms = AI_TREND_STEP_RHYTHMS;

    constructor(private readonly snapshots: AiAnalyticsSnapshotStore) {}

    async run(ctx: AiPipelineStepContext): Promise<AiPipelineStepResult> {
        const startedAt = Date.now();
        if (ctx.managerIds.length === 0) {
            return stepSkipped(this.code, AI_TREND_REASONS.rosterEmpty, {
                ms: Date.now() - startedAt,
            });
        }
        const managerIds = ctx.managerIds.map(String);
        const roster = new Set(managerIds);
        const weekKeys = trendWeekKeys(ctx.weekKey, AI_TREND_WEEKS_WINDOW);
        const monthKeys = monthKeysBack(
            previousMonthKey(ctx.day),
            AI_TREND_MONTHS_WINDOW,
        );
        const [weekRecords, monthRecords] = await Promise.all([
            this.snapshots.findByKeys(
                ctx.domain,
                AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek,
                { periodKeys: weekKeys, latestOnly: true },
            ),
            this.snapshots.findManagerMonths(ctx.domain, monthKeys, {
                limit: AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT,
                managerIds,
            }),
        ]);
        const weeks = trendRecordsOf(weekRecords, roster);
        const months = trendRecordsOf(monthRecords, roster);
        const rows = weeks.length + months.length;
        if (rows === 0) {
            return stepSkipped(this.code, AI_TREND_REASONS.windowEmpty, {
                ms: Date.now() - startedAt,
            });
        }
        const assembly = buildTrendsPayload({
            weekKey: ctx.weekKey,
            weekKeys,
            monthKeys,
            managerIds,
            weeks,
            months,
            comparableFrom: ctx.comparableFrom || null,
            params: trendParamsOf(ctx.registry),
            seed: seedOf(ctx.domain, ctx.weekKey, ctx.calcVersion),
            meta: {
                calcVersion: ctx.calcVersion,
                paramsVersion: ctx.paramsVersion,
                comparableFrom: ctx.comparableFrom || null,
                generatedAt: ctx.now.toISOString(),
                modelSnapshotId: null,
            },
        });
        if (assembly.rows.length === 0) {
            return stepSkipped(this.code, AI_TREND_REASONS.fewCalls, {
                ms: Date.now() - startedAt,
                rows,
            });
        }
        for (const row of assembly.rows) {
            await this.write(ctx, row.managerId, row.payload);
        }

        return stepOk(this.code, {
            ms: Date.now() - startedAt,
            rows,
            written: assembly.rows.length,
        });
    }

    private async write(
        ctx: AiPipelineStepContext,
        managerId: string,
        payload: ManagerTrendsPayload,
    ): Promise<void> {
        await this.snapshots.upsert({
            domain: ctx.domain,
            type: AI_ANALYTICS_SNAPSHOT_TYPE.trends,
            periodKey: ctx.weekKey,
            managerId,
            calcVersion: ctx.calcVersion,
            paramsVersion: ctx.paramsVersion,
            inputsHash: ctx.inputsHash,
            generatedAt: ctx.now.toISOString(),
            payload,
        });
    }
}
