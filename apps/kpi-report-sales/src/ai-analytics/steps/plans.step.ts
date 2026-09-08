/**
 * Шаг конвейера «снимок планов руководителя» (план Фазы 2, поток 14a;
 * план 4.9). Тик 1-го числа ставит джобу ритма `monthly` с белым списком
 * шагов `['plans']` (AI_PIPELINE_PLANS_STEPS) — этот шаг и есть снимок.
 *
 * Снимается ТЕКУЩИЙ месяц: если ключ месяца прогона не совпадает с месяцем
 * дня (заморозка 3-го числа считает закрытый предыдущий месяц), шаг
 * пропускается — снимать цели закрытого месяца задним числом нельзя.
 * Повторный тик снимок не дублирует: месяц уже снят → пропуск с причиной.
 */
import { Injectable } from '@nestjs/common';
import type { PlanSnapshot } from '@lib/sales-ai-analytics';
import {
    AI_PIPELINE_BUS_KEYS,
    AI_PIPELINE_CORE_STEP_CODES,
    AiPipelineRhythm,
} from '../constants/ai-snapshot.const';
import { AI_PLANS_SKIP_REASONS } from '../constants/ai-passport.const';
import { PlansSnapshotUseCase } from '../domain/use-cases/plans-snapshot.use-case';
import {
    AiAnalyticsPipelineStep,
    AiPipelineStepContext,
    AiPipelineStepResult,
    StepBus,
    stepOk,
    stepSkipped,
} from './step.types';

/** Снимок планов идёт только месячным ритмом (тик 1-го числа). */
export const AI_PLANS_STEP_RHYTHMS = [
    'monthly',
] as const satisfies readonly AiPipelineRhythm[];

@Injectable()
export class PlansStep implements AiAnalyticsPipelineStep {
    readonly code = AI_PIPELINE_CORE_STEP_CODES.plans;
    readonly rhythms = AI_PLANS_STEP_RHYTHMS;

    constructor(private readonly plans: PlansSnapshotUseCase) {}

    async run(
        ctx: AiPipelineStepContext,
        bus: StepBus,
    ): Promise<AiPipelineStepResult> {
        const startedAt = Date.now();
        if (ctx.monthKey !== ctx.day.slice(0, 7)) {
            return stepSkipped(this.code, AI_PLANS_SKIP_REASONS.monthClosed, {
                ms: Date.now() - startedAt,
            });
        }
        const result = await this.plans.capture({
            domain: ctx.domain,
            monthKey: ctx.monthKey,
            day: ctx.day,
            managerIds: ctx.managerIds,
            calcVersion: ctx.calcVersion,
            paramsVersion: ctx.paramsVersion,
            inputsHash: ctx.inputsHash,
            generatedAt: ctx.now.toISOString(),
            now: ctx.now,
            forceRefresh: ctx.forceRefresh,
        });
        if (result.snapshot) {
            bus.set<PlanSnapshot>(AI_PIPELINE_BUS_KEYS.plans, result.snapshot);
        }
        const values = {
            ms: Date.now() - startedAt,
            rows: result.snapshot?.managers.length ?? 0,
            bitrixCalls: result.bitrixCalls,
            written: result.written,
        };

        return result.skipped
            ? stepSkipped(this.code, result.skipped, values)
            : stepOk(this.code, values);
    }
}
