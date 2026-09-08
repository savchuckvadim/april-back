/**
 * Шаг ночного конвейера «три звонка недели» (план Фазы 2, поток 15;
 * постановка — `ai-sales-analytics-plan.md` §4.11 «калибровочный контур»,
 * ритм «еженедельно пн»): по закончившейся неделе подбираются три звонка
 * для слепой проверки руководителем и пишется запись подбора.
 *
 * Кандидаты берутся из шины (`calls.rows` — строки звонков, загруженные
 * шагом звонков), поэтому второй тяжёлой выборки шаг не делает. Строк в
 * шине нет — шаг штатно пропускается с причиной (§5.4), конвейер идёт
 * дальше: подбор недели не тот случай, из-за которого стоит валить прогон.
 *
 * ⚠ Идемпотентность: подбор детерминирован по `seedOf(domain, weekKey)`,
 * а запись пишется через upsert стора (прошлая уходит в superseded),
 * поэтому повтор прогона за ту же неделю не плодит наборы и не меняет
 * состав звонков.
 */
import { Injectable } from '@nestjs/common';
import {
    pickRopMarkCalls,
    ropMarkSeed,
    type RopMarkCandidate,
} from '@lib/sales-ai-analytics/model/rop-mark';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import {
    AI_ROP_MARK_SKIP_REASONS,
    AI_ROP_MARK_STEP_CODE,
    AI_ROP_MARK_STEP_RHYTHMS,
    AI_ROP_MARK_WEEKLY_LIMIT,
} from '../constants/ai-rop-mark.const';
import { AiAnalyticsRopMarkStore } from '../store/ai-analytics-rop-mark.store';
import {
    AiAnalyticsPipelineStep,
    AiPipelineStepContext,
    AiPipelineStepResult,
    StepBus,
    stepOk,
    stepSkipped,
} from './step.types';

const asRecord = (value: unknown): Record<string, unknown> | null =>
    typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)
        : null;

const idOf = (value: unknown): string =>
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';

/**
 * Строки звонков из шины → кандидаты подбора. Чужая форма молча
 * отбрасывается: шаг не должен падать из-за соседа, положившего в шину
 * не то (тот же приём, что в санити-панели).
 */
export function ropMarkCandidates(
    value: unknown,
    managerIds: readonly number[] = [],
): RopMarkCandidate[] {
    if (!Array.isArray(value)) return [];
    const roster = new Set(managerIds.map(id => String(id)));
    return value.flatMap((item: unknown): RopMarkCandidate[] => {
        const row = asRecord(item);
        if (!row) return [];
        const transcriptionId = idOf(row.transcriptionId);
        const managerId = idOf(row.managerId);
        if (!transcriptionId || !managerId) return [];
        if (roster.size && !roster.has(managerId)) return [];
        return [
            {
                transcriptionId,
                managerId,
                callType:
                    typeof row.callType === 'string' ? row.callType : null,
                score: typeof row.score === 'number' ? row.score : null,
            },
        ];
    });
}

@Injectable()
export class RopMarkStep implements AiAnalyticsPipelineStep {
    readonly code = AI_ROP_MARK_STEP_CODE;
    readonly rhythms = AI_ROP_MARK_STEP_RHYTHMS;

    constructor(private readonly store: AiAnalyticsRopMarkStore) {}

    async run(
        ctx: AiPipelineStepContext,
        bus: StepBus,
    ): Promise<AiPipelineStepResult> {
        const startedAt = Date.now();
        const rows = bus.get(AI_PIPELINE_BUS_KEYS.callsRows);
        if (!Array.isArray(rows) || !rows.length) {
            return stepSkipped(this.code, AI_ROP_MARK_SKIP_REASONS.noCalls, {
                ms: Date.now() - startedAt,
            });
        }
        const candidates = ropMarkCandidates(rows, ctx.managerIds);
        if (!candidates.length) {
            return stepSkipped(
                this.code,
                AI_ROP_MARK_SKIP_REASONS.noCandidates,
                { ms: Date.now() - startedAt, rows: rows.length },
            );
        }
        const seed = ropMarkSeed(ctx.domain, ctx.weekKey);
        const calls = pickRopMarkCalls(candidates, {
            seed,
            limit: AI_ROP_MARK_WEEKLY_LIMIT,
        });
        await this.store.savePick({
            domain: ctx.domain,
            weekKey: ctx.weekKey,
            seed,
            generatedAt: ctx.now.toISOString(),
            calls,
        });
        return stepOk(this.code, {
            ms: Date.now() - startedAt,
            rows: candidates.length,
            written: 1,
        });
    }
}
