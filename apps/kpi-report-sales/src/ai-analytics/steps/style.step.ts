/**
 * Шаг конвейера «стиль» (план Фазы 2, поток 14b): месячный профиль стиля
 * менеджера (`ai-analytics-style`) по окну в три месяца.
 *
 * Окно шире месяца намеренно: подпись стиля человек читает как факт о
 * себе, и одного месяца для неё мало. При менее чем `style_min_calls`
 * (по умолчанию 40) сравнимых разборов за окно профиль всё равно
 * сохраняется — но с `confidence: none`, пустым вектором и без подписей:
 * «данных пока мало» честнее любой характеристики.
 *
 * Шаг идёт ПЕРЕД шагом финансов: месячный снапшот берёт профиль из шины
 * (ключ `style`), а не считает его второй раз.
 *
 * `@Injectable` без bitrix-состояния: выборку делает загрузчик call-lib.
 */
import { Injectable } from '@nestjs/common';
import { AI_ANALYTICS_SNAPSHOT_TYPE } from '@lib/sales-ai-analytics';
import {
    AI_MANAGER_SNAPSHOT_REASONS,
    AI_MANAGER_STEP_CODE,
    AI_STYLE_STEP_RHYTHMS,
    AI_STYLE_WINDOW_MONTHS,
    monthKeysBack,
    monthsWindow,
} from '../constants/ai-manager-snapshot.const';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import { readPassports } from '../domain/assembler/bus-facts.util';
import { buildManagerStylePayload } from '../domain/assembler/manager-style.assembler';
import type {
    ManagerStyleFacts,
    ManagerStylePayload,
} from '../domain/assembler/manager-snapshot.types';
import { CallsLoader } from '../domain/loaders/calls.loader';
import { portalRangeUtc } from '../domain/loaders/period.util';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import {
    AiAnalyticsPipelineStep,
    AiPipelineStepContext,
    AiPipelineStepResult,
    StepBus,
    stepOk,
    stepSkipped,
} from './step.types';

/** Значение шины `style`: профиль менеджера для месячного снапшота. */
export interface StyleBusEntry {
    managerId: string;
    style: ManagerStyleFacts;
}

/** Полосы стажа из паспортов шины: оффсет полосы в расчёте осей. */
export function tenureBandsOf(passport: unknown): Record<string, string> {
    const bands: Record<string, string> = {};
    for (const [managerId, facts] of readPassports(passport)) {
        if (facts.tenureBand !== null) bands[managerId] = facts.tenureBand;
    }
    return bands;
}

@Injectable()
export class StyleStep implements AiAnalyticsPipelineStep {
    readonly code = AI_MANAGER_STEP_CODE.style;
    readonly rhythms = AI_STYLE_STEP_RHYTHMS;

    constructor(
        private readonly calls: CallsLoader,
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
        const window = monthKeysBack(ctx.monthKey, AI_STYLE_WINDOW_MONTHS);
        const bounds = monthsWindow(ctx.monthKey, AI_STYLE_WINDOW_MONTHS);
        const range = portalRangeUtc(bounds.from, bounds.to, ctx.timeZone);
        const rows = await this.calls.loadLite(
            ctx.domain,
            range.from,
            range.to,
        );
        if (rows.length === 0) {
            return stepSkipped(
                this.code,
                AI_MANAGER_SNAPSHOT_REASONS.styleWindowEmpty,
                { ms: Date.now() - startedAt },
            );
        }
        const assembly = buildManagerStylePayload({
            monthKey: ctx.monthKey,
            window,
            rows,
            managerIds: ctx.managerIds.map(String),
            registry: ctx.registry,
            tenureBands: tenureBandsOf(bus.get(AI_PIPELINE_BUS_KEYS.passport)),
            previousTags: await this.previousTags(ctx),
            meta: {
                calcVersion: ctx.calcVersion,
                paramsVersion: ctx.paramsVersion,
                comparableFrom: ctx.comparableFrom || null,
                generatedAt: ctx.now.toISOString(),
                modelSnapshotId: null,
            },
        });
        bus.set<StyleBusEntry[]>(
            AI_PIPELINE_BUS_KEYS.style,
            [...assembly.facts.entries()].map(([managerId, style]) => ({
                managerId,
                style,
            })),
        );
        for (const row of assembly.rows) {
            await this.write(ctx, row.managerId, row.payload);
        }
        return stepOk(this.code, {
            ms: Date.now() - startedAt,
            rows: rows.length,
            written: assembly.rows.length,
        });
    }

    /**
     * Подписи прошлого окна — гистерезис профиля: без него профиль мигал
     * бы между пересчётами из-за одного разбора.
     */
    private async previousTags(
        ctx: AiPipelineStepContext,
    ): Promise<Map<string, readonly string[]>> {
        const previous = monthKeysBack(ctx.monthKey, 2)[0];
        const records = await this.snapshots.findByKeys(
            ctx.domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.style,
            { periodKeys: [previous] },
        );
        const tags = new Map<string, readonly string[]>();
        for (const record of records) {
            const payload = record.payload as Partial<ManagerStylePayload>;
            if (record.managerId === null || !Array.isArray(payload.tags)) {
                continue;
            }
            tags.set(
                record.managerId,
                payload.tags.map(tag => tag.code),
            );
        }
        return tags;
    }

    private async write(
        ctx: AiPipelineStepContext,
        managerId: string,
        payload: ManagerStylePayload,
    ): Promise<void> {
        await this.snapshots.upsert({
            domain: ctx.domain,
            type: AI_ANALYTICS_SNAPSHOT_TYPE.style,
            periodKey: ctx.monthKey,
            managerId,
            calcVersion: ctx.calcVersion,
            paramsVersion: ctx.paramsVersion,
            inputsHash: ctx.inputsHash,
            generatedAt: ctx.now.toISOString(),
            payload,
        });
    }
}
