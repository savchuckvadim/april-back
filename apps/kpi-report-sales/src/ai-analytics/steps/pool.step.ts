/**
 * Шаг конвейера «пул порталов» (план `ai-sales-analytics` §4.4 «Пул»,
 * §4.7 SI_0, §4.10 E2, §4.11; Фаза 4, П17/П22).
 *
 * Порядок: портал без датированного согласия (или с согласием позже конца
 * месяца расчёта) — пропуск `not-in-pool` (ничего не читает, не пишет и не
 * публикует) → входы всех порталов с
 * согласием из `ais` (`PoolPortalsLoader`, обезличенно) → `buildPool`
 * библиотеки (нормы рёбер μ₀/κ̄, β пула с I², F(d), чек, сезон) → копия
 * снапшота `ai-analytics-pool` под текущим доменом (portal-month, ключ
 * месяца расчёта) и шина `pool` для модели портала.
 *
 * Битрикс не вызывается. Доменов в нагрузке нет: только обезличенные ключи
 * `snapshotHashKey([domain])` и `selfKey` — чтобы портал нашёл себя.
 * Идемпотентен: запись через `upsert`, сигнатура учитывает содержимое пула.
 *
 * `@Injectable` без bitrix-состояния.
 */
import { Injectable } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    buildPool,
    isIsoDate,
    type PoolSnapshot,
} from '@lib/sales-ai-analytics';
import {
    AI_POOL_STEP_CODE,
    AI_POOL_STEP_REASONS,
    AI_POOL_STEP_RHYTHMS,
} from '../constants/ai-pool.const';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import {
    consentInForce,
    poolConsentDayOf,
    poolPortalKeyOf,
} from '../domain/loaders/pool-portals.facts';
import { PoolPortalsLoader } from '../domain/loaders/pool-portals.loader';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import {
    poolInputsHashOf,
    poolParamsOf,
    poolSnapshotOf,
    receivesPool,
} from './pool.facts';
import {
    type AiAnalyticsPipelineStep,
    type AiPipelineStepContext,
    type AiPipelineStepResult,
    type StepBus,
    stepOk,
    stepSkipped,
} from './step.types';

/** Значение шины `pool`: id записи и нагрузка снапшота. */
export interface PoolBusEntry {
    readonly id: string;
    readonly payload: PoolSnapshot;
}

@Injectable()
export class PoolStep implements AiAnalyticsPipelineStep {
    readonly code = AI_POOL_STEP_CODE;
    readonly rhythms = AI_POOL_STEP_RHYTHMS;
    /** Теневой шаг: сбой источника не обрывает прогон (раннер — пропуск). */
    readonly optional = true;

    constructor(
        private readonly portals: PoolPortalsLoader,
        private readonly snapshots: AiAnalyticsSnapshotStore,
    ) {}

    async run(
        ctx: AiPipelineStepContext,
        bus: StepBus,
    ): Promise<AiPipelineStepResult> {
        const startedAt = Date.now();
        const skip = (reason: string, rows = 0): AiPipelineStepResult =>
            stepSkipped(this.code, reason, {
                ms: Date.now() - startedAt,
                rows,
            });
        if (!isIsoDate(ctx.day)) {
            return skip(AI_POOL_STEP_REASONS.badDay);
        }
        // Согласия нет или оно не в силе к концу месяца расчёта (та же
        // граница, что у модели портала) — чужие порталы не читаются.
        const asOf = poolConsentDayOf(ctx.monthKey);
        if (!consentInForce(ctx.settings, asOf)) {
            return skip(AI_POOL_STEP_REASONS.notInPool);
        }
        const inputs = await this.portals.load(ctx.monthKey);
        const selfKey = poolPortalKeyOf(ctx.domain);
        const pool = buildPool({
            portals: inputs,
            now: asOf,
            params: poolParamsOf(ctx.registry),
        });
        if (!receivesPool(pool, selfKey)) {
            return skip(AI_POOL_STEP_REASONS.notInPool, inputs.length);
        }
        const payload = poolSnapshotOf(pool, {
            monthKey: ctx.monthKey,
            selfKey,
            meta: {
                calcVersion: ctx.calcVersion,
                paramsVersion: ctx.paramsVersion,
                comparableFrom: ctx.comparableFrom || null,
                generatedAt: ctx.now.toISOString(),
                modelSnapshotId: null,
            },
        });
        const saved = await this.snapshots.upsert(
            {
                domain: ctx.domain,
                type: AI_ANALYTICS_SNAPSHOT_TYPE.pool,
                periodKey: ctx.monthKey,
                managerId: null,
                calcVersion: ctx.calcVersion,
                paramsVersion: ctx.paramsVersion,
                inputsHash: poolInputsHashOf(ctx.inputsHash, payload),
                generatedAt: ctx.now.toISOString(),
                payload,
            },
            { force: ctx.forceRefresh },
        );
        bus.set<PoolBusEntry>(AI_PIPELINE_BUS_KEYS.pool, {
            id: saved.id,
            payload,
        });

        return stepOk(this.code, {
            ms: Date.now() - startedAt,
            rows: inputs.length,
            written: saved.written,
        });
    }
}
