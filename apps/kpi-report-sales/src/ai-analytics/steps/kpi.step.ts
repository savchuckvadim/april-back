/**
 * Шаг конвейера «KPI-месяцы» (план Фазы 2, поток 14b): факты самоотчёта
 * менеджеров за месяц прогона кладутся в шину под ключом `kpi.months` —
 * из них месячный снапшот берёт KPI-вектор и s/n рёбер воронки.
 *
 * Закрытый месяц берётся из кэша `kpi-month` (30 дней) и Битрикс для него
 * не зовётся: закрытый месяц не меняется, а ночная очередь портала одна
 * на все выборки. Поэтому `bitrixCalls` шага — это ровно число месяцев,
 * которые пришлось посчитать заново.
 *
 * Один месяц за прогон в любом ритме: догон истории ставит по джобе на
 * месяц, и лимит «не больше трёх месяцев за ночь» держит планировщик
 * догона, а не размер окна шага.
 *
 * `@Injectable` без bitrix-состояния: инстанс берёт загрузчик KPI.
 */
import { Injectable } from '@nestjs/common';
import {
    AI_KPI_STEP_RHYTHMS,
    AI_MANAGER_SNAPSHOT_REASONS,
    AI_MANAGER_STEP_CODE,
    monthBounds,
} from '../constants/ai-manager-snapshot.const';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import { KpiLoader } from '../domain/loaders/kpi.loader';
import type { AiKpiMonthsResult } from '../domain/loaders/kpi.types';
import {
    AiAnalyticsPipelineStep,
    AiPipelineStepContext,
    AiPipelineStepResult,
    StepBus,
    stepOk,
    stepSkipped,
} from './step.types';

/** Загруженных строк «менеджер × месяц» — объём шага для журнала. */
export const kpiRowsOf = (result: AiKpiMonthsResult): number =>
    result.months.reduce((sum, month) => sum + month.managers.length, 0);

/**
 * Месяцы, которые пришлось считать заново. Каждый такой месяц — поход в
 * Битрикс (kpi-report + per-type батч); месяц из кэша не стоит ничего.
 */
export const kpiBitrixCallsOf = (result: AiKpiMonthsResult): number =>
    result.months.filter(month => !month.fromCache).length;

@Injectable()
export class KpiStep implements AiAnalyticsPipelineStep {
    readonly code = AI_MANAGER_STEP_CODE.kpi;
    readonly rhythms = AI_KPI_STEP_RHYTHMS;

    constructor(private readonly kpi: KpiLoader) {}

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
        const { from, to } = monthBounds(ctx.monthKey);
        const result = await this.kpi.loadKpiMonths(
            ctx.domain,
            from,
            to,
            ctx.managerIds,
            { forceRefresh: ctx.forceRefresh, now: ctx.now },
        );
        bus.set(AI_PIPELINE_BUS_KEYS.kpiMonths, result);
        return stepOk(this.code, {
            ms: Date.now() - startedAt,
            rows: kpiRowsOf(result),
            bitrixCalls: kpiBitrixCallsOf(result),
        });
    }
}
