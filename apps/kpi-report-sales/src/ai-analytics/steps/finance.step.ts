/**
 * Шаг конвейера «финансы и месяц менеджера» (план Фазы 2, поток 14b):
 * закрытые продажи и живой пайплайн из тех же use-case'ов, что и вкладка
 * «Финансы» (числа обязаны совпадать на тех же фильтрах), и запись
 * месячного снапшота `ai-analytics-manager-month`.
 *
 * Месяц закрывает именно этот шаг: он идёт последним в месячной цепочке
 * (звонки → KPI → стиль → финансы) и собирает нагрузку из шины —
 * разборов, KPI-фактов, паспорта, снимка планов и профиля стиля.
 *
 * Что нельзя ломать:
 * - **замороженный месяц не перезаписывается**: с 3-го числа следующего
 *   месяца запись окончательна, и ночной прогон её не трогает
 *   (`forceRefresh` — единственный обход, он же ручной пересчёт);
 * - закрытые месяцы берутся из кэша, Битрикс для них не зовётся;
 * - догон истории пишет не больше `AI_MONTH_BACKFILL_LIMIT` месяцев за
 *   ночь: иначе нормам следующей волны нечего будет читать регулярно.
 *
 * `@Injectable` без bitrix-состояния: инстанс берут загрузчики.
 */
import { Injectable } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    resolveNumberParam,
    toPortalDate,
} from '@lib/sales-ai-analytics';
import {
    AI_FINANCE_STEP_RHYTHMS,
    AI_MANAGER_SNAPSHOT_REASONS,
    AI_MANAGER_STEP_CODE,
    AI_MONTH_BACKFILL_LIMIT,
    monthBounds,
} from '../constants/ai-manager-snapshot.const';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import {
    readChainSharePct,
    readPassports,
    readStyles,
} from '../domain/assembler/bus-facts.util';
import { buildManagerMonthPayload } from '../domain/assembler/manager-month.assembler';
import { FinanceLoader } from '../domain/loaders/finance.loader';
import type { AiFinanceResult } from '../domain/loaders/finance.types';
import type { AiKpiMonthsResult } from '../domain/loaders/kpi.types';
import type { DatedLiteRow } from '../domain/loaders/lite-row.mapper';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import { NO_PLANS, plansByMonth } from './finance.plans';
import {
    AiAnalyticsPipelineStep,
    AiPipelineStepContext,
    AiPipelineStepResult,
    StepBus,
    stepOk,
    stepSkipped,
} from './step.types';

/**
 * Месяцы прогона: обычный ритм пишет свой месяц, догон — месяцы, которые
 * принесли KPI-факты, но не больше лимита за ночь.
 */
export function monthsForRun(
    ctx: AiPipelineStepContext,
    kpi: AiKpiMonthsResult | undefined,
): string[] {
    if (ctx.rhythm !== 'backfill') return [ctx.monthKey];
    const loaded = (kpi?.months ?? []).map(month => month.month);
    const months = loaded.length > 0 ? loaded : [ctx.monthKey];
    return [...new Set(months)].sort().slice(-AI_MONTH_BACKFILL_LIMIT);
}

/** Месяц заморожен, если так помечена уже записанная нагрузка. */
export function isFrozenPayload(payload: unknown): boolean {
    return (
        typeof payload === 'object' &&
        payload !== null &&
        (payload as { frozen?: unknown }).frozen === true
    );
}

@Injectable()
export class FinanceStep implements AiAnalyticsPipelineStep {
    readonly code = AI_MANAGER_STEP_CODE.finance;
    readonly rhythms = AI_FINANCE_STEP_RHYTHMS;

    constructor(
        private readonly finance: FinanceLoader,
        private readonly snapshots: AiAnalyticsSnapshotStore,
    ) {}

    async run(
        ctx: AiPipelineStepContext,
        bus: StepBus,
    ): Promise<AiPipelineStepResult> {
        const startedAt = Date.now();
        if (ctx.managerIds.length === 0) {
            return stepSkipped(
                this.code,
                AI_MANAGER_SNAPSHOT_REASONS.rosterEmpty,
                { ms: Date.now() - startedAt },
            );
        }
        const kpi = bus.get<AiKpiMonthsResult>(AI_PIPELINE_BUS_KEYS.kpiMonths);
        const months = monthsForRun(ctx, kpi);
        const finance = await this.load(ctx, months);
        bus.set(AI_PIPELINE_BUS_KEYS.financeResult, finance);
        const values = {
            ms: Date.now() - startedAt,
            rows: financeRowsOf(finance),
            bitrixCalls: bitrixCallsOf(finance),
        };
        if (kpi === undefined) {
            return stepSkipped(
                this.code,
                AI_MANAGER_SNAPSHOT_REASONS.kpiMissing,
                values,
            );
        }
        const frozen = await this.frozenMonths(ctx, months);
        const written = await this.writeMonths(
            ctx,
            bus,
            months.filter(month => !frozen.has(month)),
            { kpi, finance },
        );
        const result = { ...values, ms: Date.now() - startedAt, written };
        return written === 0
            ? stepSkipped(
                  this.code,
                  AI_MANAGER_SNAPSHOT_REASONS.monthFrozen,
                  result,
              )
            : stepOk(this.code, result);
    }

    /** Финансы окна месяцев прогона: закрытые продажи + живой пайплайн. */
    private async load(
        ctx: AiPipelineStepContext,
        months: readonly string[],
    ): Promise<AiFinanceResult> {
        const from = monthBounds(months[0] ?? ctx.monthKey).from;
        const to = monthBounds(months[months.length - 1] ?? ctx.monthKey).to;
        return this.finance.loadFinance(ctx.domain, from, to, ctx.managerIds, {
            forceRefresh: ctx.forceRefresh,
            now: ctx.now,
            hotStageCode: ctx.settings.definitions.hotStageCode,
        });
    }

    /** Месяцы с уже замороженной записью (forceRefresh снимает защиту). */
    private async frozenMonths(
        ctx: AiPipelineStepContext,
        months: readonly string[],
    ): Promise<Set<string>> {
        if (ctx.forceRefresh) return new Set<string>();
        const records = await this.snapshots.findByKeys(
            ctx.domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            { periodKeys: [...months] },
        );
        return new Set(
            records
                .filter(record => isFrozenPayload(record.payload))
                .map(record => record.periodKey),
        );
    }

    /** Нагрузки месяцев и их запись; возвращает число записей. */
    private async writeMonths(
        ctx: AiPipelineStepContext,
        bus: StepBus,
        months: readonly string[],
        data: { kpi: AiKpiMonthsResult; finance: AiFinanceResult },
    ): Promise<number> {
        if (months.length === 0) return 0;
        const rows =
            bus.get<DatedLiteRow[]>(AI_PIPELINE_BUS_KEYS.callsRows) ?? [];
        const modelSnapshotId = await this.modelSnapshotId(ctx);
        const shared = {
            day: ctx.day,
            managerIds: ctx.managerIds.map(String),
            calendar: ctx.calendar,
            timeZone: ctx.timeZone,
            settings: ctx.settings,
            registry: ctx.registry,
            passports: readPassports(bus.get(AI_PIPELINE_BUS_KEYS.passport)),
            styles: readStyles(bus.get(AI_PIPELINE_BUS_KEYS.style)),
            chainSharePct: readChainSharePct(
                bus.get(AI_PIPELINE_BUS_KEYS.chain),
            ),
            comparableFrom: ctx.comparableFrom || null,
            ...this.shortCallSec(ctx),
            meta: {
                calcVersion: ctx.calcVersion,
                paramsVersion: ctx.paramsVersion,
                comparableFrom: ctx.comparableFrom || null,
                generatedAt: ctx.now.toISOString(),
                modelSnapshotId,
            },
        };
        // Цели месяца: свежий снимок из шины (тик 1-го числа) либо
        // записанный снапшот `ai-analytics-plan` — иначе поле planSnapshot
        // месячной записи пустовало бы все дни, кроме первого.
        const plans = await plansByMonth(this.snapshots, {
            domain: ctx.domain,
            monthKey: ctx.monthKey,
            months,
            fromBus: bus.get(AI_PIPELINE_BUS_KEYS.plans),
        });
        let written = 0;
        for (const monthKey of months) {
            const bounds = monthBounds(monthKey);
            const assembly = buildManagerMonthPayload({
                ...shared,
                plans: plans.get(monthKey) ?? NO_PLANS,
                monthKey,
                rows: rows.filter(row => inMonth(row, bounds, ctx.timeZone)),
                kpi: data.kpi.months.find(month => month.month === monthKey),
                finance: data.finance,
            });
            for (const row of assembly.rows) {
                await this.snapshots.upsert({
                    domain: ctx.domain,
                    type: AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
                    periodKey: monthKey,
                    managerId: row.managerId,
                    calcVersion: ctx.calcVersion,
                    paramsVersion: ctx.paramsVersion,
                    inputsHash: ctx.inputsHash,
                    generatedAt: ctx.now.toISOString(),
                    payload: row.payload,
                });
                written += 1;
            }
        }
        return written;
    }

    /** id последней модели портала; её нет — месяц считается без норм. */
    private async modelSnapshotId(
        ctx: AiPipelineStepContext,
    ): Promise<string | null> {
        const record = await this.snapshots.latest(
            ctx.domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.portalModel,
            null,
        );
        return record?.id ?? null;
    }

    /** Единый порог длительности портала (решение А.1). */
    private shortCallSec(ctx: AiPipelineStepContext): {
        shortCallSec?: number;
    } {
        const value = resolveNumberParam(
            'min_duration_sec_by_type',
            ctx.registry,
        );
        return value === undefined ? {} : { shortCallSec: value };
    }
}

/** Звонок относится к месяцу по дате портала, а не по UTC. */
function inMonth(
    row: DatedLiteRow,
    bounds: { from: string; to: string },
    timeZone: string,
): boolean {
    const day = toPortalDate(row.callStartedAt, timeZone);
    return day >= bounds.from && day <= bounds.to;
}

/** Загруженных строк: «менеджер × месяц» плюс строки живого пайплайна. */
function financeRowsOf(finance: AiFinanceResult): number {
    const months = finance.months.reduce(
        (sum, month) => sum + month.managers.length,
        0,
    );
    return months + finance.pipeline.managers.length;
}

/**
 * Походы в Битрикс: месяц, посчитанный заново, плюс живой пайплайн, если
 * он не пришёл из кэша. Закрытые месяцы из кэша не стоят ничего.
 */
function bitrixCallsOf(finance: AiFinanceResult): number {
    const months = finance.months.filter(month => !month.fromCache).length;
    return months + (finance.pipeline.fromCache ? 0 : 1);
}
