/**
 * Шаг конвейера «модель портала» (план Фазы 2, поток 16a): раз в месяц
 * пересчитывает `ai-analytics-portal-model` из накопленных месячных
 * снапшотов менеджеров и кладёт результат в шину под ключом `portalModel`
 * — прогноз и витрина берут нормы оттуда, а не считают их заново.
 *
 * Шаг идёт ПОСЛЕ месячных снапшотов (`finance` закрывает месяц) и после
 * истории стадий: нормы считаются по уже записанным месяцам, а стадийные
 * θ, лаги продаж и доля сцепки приходят из шины.
 *
 * Битрикс на этом шаге не вызывается вовсе — все входы лежат в `ais`,
 * поэтому месячный шаг укладывается в бюджет ночной джобы.
 *
 * `@Injectable` без bitrix-состояния: сценарий и стор снапшотов.
 */
import { Injectable } from '@nestjs/common';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import {
    AI_PORTAL_MODEL_REASONS,
    AI_PORTAL_MODEL_RHYTHMS,
    AI_PORTAL_MODEL_STEP_CODE,
} from '../constants/ai-portal-model.const';
import { readChainSharePct } from '../domain/assembler/bus-facts.util';
import type { PortalModelFacts } from '../domain/assembler/portal-model.types';
import { PortalModelUseCase } from '../domain/use-cases/portal-model.use-case';
import {
    busNumber,
    chainEstimandOf,
    qualityGroupsOf,
    rosterOf,
    rubricVersionOf,
    saleLagsOf,
    sanityReportOf,
    stageThetasOf,
} from './portal-model.facts';
import {
    AiAnalyticsPipelineStep,
    AiPipelineStepContext,
    AiPipelineStepResult,
    StepBus,
    stepOk,
    stepSkipped,
} from './step.types';

/** Значение шины `portalModel`: id записи и нагрузка модели. */
export interface PortalModelBusEntry {
    /** id записи `ais` — он же `meta.modelSnapshotId` потребителей. */
    id: string | null;
    monthKey: string;
    payload: unknown;
}

/**
 * Входы модели, которых нет в месячных снапшотах, — из шины прогона.
 * Доля сцепки читается тем же `readChainSharePct`, что и у финансов:
 * один читатель на форму писателя `EpisodesChain.sharePct` (аудит B1).
 * Санити-отчёт — из ключа `sanity` того же прогона (панель идёт перед
 * моделью в месячном ритме); нет отчёта — `null`, старый не тянется.
 */
export function portalModelFacts(
    ctx: AiPipelineStepContext,
    bus: StepBus,
): PortalModelFacts {
    const rows = bus.get(AI_PIPELINE_BUS_KEYS.callsRows);
    const chain = bus.get(AI_PIPELINE_BUS_KEYS.chain);

    return {
        stageThetas: stageThetasOf(bus.get(AI_PIPELINE_BUS_KEYS.stageTheta)),
        saleLags: saleLagsOf(bus.get(AI_PIPELINE_BUS_KEYS.episodes)),
        chainSharePct: readChainSharePct(chain),
        ...chainEstimandOf(chain),
        sanity: sanityReportOf(bus.get(AI_PIPELINE_BUS_KEYS.sanity)),
        cycleMedianDays:
            busNumber(bus.get(AI_PIPELINE_BUS_KEYS.cycleMedian)) ?? null,
        historyMonths:
            busNumber(bus.get(AI_PIPELINE_BUS_KEYS.historyMonths)) ?? 0,
        qualityGroups: qualityGroupsOf(rows),
        roster: rosterOf(bus.get(AI_PIPELINE_BUS_KEYS.passport)),
        rubricVersion: rubricVersionOf(rows),
        registry: ctx.registry,
        paramsVersion: ctx.paramsVersion,
        comparableFrom: ctx.comparableFrom,
        calcVersion: ctx.calcVersion,
        inputsHash: ctx.inputsHash,
    };
}

@Injectable()
export class PortalModelStep implements AiAnalyticsPipelineStep {
    readonly code = AI_PORTAL_MODEL_STEP_CODE;
    readonly rhythms = AI_PORTAL_MODEL_RHYTHMS;

    constructor(private readonly useCase: PortalModelUseCase) {}

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
        const result = await this.useCase.execute(
            {
                domain: ctx.domain,
                monthKey: ctx.monthKey,
                forceRefresh: ctx.forceRefresh,
                facts: portalModelFacts(ctx, bus),
            },
            ctx.now,
        );
        const values = {
            ms: Date.now() - startedAt,
            rows: result.months,
            written: result.written,
        };
        if (result.payload === null) {
            return stepSkipped(
                this.code,
                result.reason ?? AI_PORTAL_MODEL_REASONS.monthsMissing,
                values,
            );
        }
        bus.set<PortalModelBusEntry>(AI_PIPELINE_BUS_KEYS.portalModel, {
            id: result.id,
            monthKey: ctx.monthKey,
            payload: result.payload,
        });

        return result.reused
            ? stepSkipped(
                  this.code,
                  result.reason ?? AI_PORTAL_MODEL_REASONS.reusedPrevious,
                  values,
              )
            : stepOk(this.code, values);
    }
}
