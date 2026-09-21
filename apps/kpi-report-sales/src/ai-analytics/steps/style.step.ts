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
 * Оси разбора (`inquiry`, `initiative`, `price_position`, `funnel_focus`)
 * идут из lite-строк call-lib, жёсткие оси телефонии и CRM
 * (`persistence`, `tempo`, `rhythm`) — из `StyleCrmLoader` за то же окно
 * (месячный кэш; долг 30 волны C). Телефония недоступна — шаг не падает:
 * жёсткие оси молчат, в результате стоит причина `style-crm-unavailable`.
 *
 * Шаг идёт ПЕРЕД шагом финансов: месячный снапшот берёт профиль из шины
 * (ключ `style`), а не считает его второй раз.
 *
 * `@Injectable` без bitrix-состояния: выборки делают загрузчики.
 */
import { Injectable, Logger } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    resolveNumberParam,
    type ParamContext,
} from '@lib/sales-ai-analytics';
import {
    AI_MANAGER_SNAPSHOT_REASONS,
    AI_MANAGER_STEP_CODE,
    AI_STYLE_STEP_RHYTHMS,
    AI_STYLE_WINDOW_MONTHS,
    monthKeysBack,
    monthsWindow,
    type AiPeriodBounds,
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
import { StyleCrmLoader } from '../domain/loaders/style-crm.loader';
import type {
    StyleCrmManagerMonth,
    StyleCrmThresholds,
} from '../domain/loaders/style-crm.types';
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

/** Причина в результате шага: телефония не загрузилась, жёсткие оси молчат. */
export const AI_STYLE_CRM_UNAVAILABLE_REASON = 'style-crm-unavailable' as const;

/** Жёсткие счётчики окна и признак деградации. */
interface StyleCrmFacts {
    managers: StyleCrmManagerMonth[];
    degraded: boolean;
}

/** Полосы стажа из паспортов шины: оффсет полосы в расчёте осей. */
export function tenureBandsOf(passport: unknown): Record<string, string> {
    const bands: Record<string, string> = {};
    for (const [managerId, facts] of readPassports(passport)) {
        if (facts.tenureBand !== null) bands[managerId] = facts.tenureBand;
    }
    return bands;
}

/**
 * Пороги счётчиков из реестра портала: сейчас параметром реестра является
 * только порог дисперсии (`style_dispersion_min_days`), остальные пороги
 * — определения единиц документа стиля.
 */
export function styleCrmThresholdsOf(
    registry: ParamContext,
): Partial<StyleCrmThresholds> {
    const dispersionMinDays = resolveNumberParam(
        'style_dispersion_min_days',
        registry,
    );
    return dispersionMinDays === undefined ? {} : { dispersionMinDays };
}

@Injectable()
export class StyleStep implements AiAnalyticsPipelineStep {
    readonly code = AI_MANAGER_STEP_CODE.style;
    readonly rhythms = AI_STYLE_STEP_RHYTHMS;
    private readonly logger = new Logger(StyleStep.name);

    constructor(
        private readonly calls: CallsLoader,
        private readonly snapshots: AiAnalyticsSnapshotStore,
        private readonly crm: StyleCrmLoader,
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
        const crm = await this.loadCrm(ctx, bounds);
        const assembly = buildManagerStylePayload({
            monthKey: ctx.monthKey,
            window,
            rows,
            managerIds: ctx.managerIds.map(String),
            registry: ctx.registry,
            tenureBands: tenureBandsOf(bus.get(AI_PIPELINE_BUS_KEYS.passport)),
            previousTags: await this.previousTags(ctx),
            crm: crm.managers,
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
            ...(crm.degraded
                ? { reason: AI_STYLE_CRM_UNAVAILABLE_REASON }
                : {}),
        });
    }

    /**
     * Жёсткие счётчики телефонии и CRM за окно стиля (месячный кэш
     * загрузчика). Ошибка телефонии профиль не роняет: оси разбора
     * важнее, чем полнота, — жёсткие оси молчат, причина в результате.
     */
    private async loadCrm(
        ctx: AiPipelineStepContext,
        bounds: AiPeriodBounds,
    ): Promise<StyleCrmFacts> {
        try {
            const result = await this.crm.load(
                ctx.domain,
                bounds.from,
                bounds.to,
                ctx.managerIds,
                {
                    now: ctx.now,
                    calendar: ctx.calendar,
                    forceRefresh: ctx.forceRefresh,
                    thresholds: styleCrmThresholdsOf(ctx.registry),
                },
            );
            return { managers: result.managers, degraded: false };
        } catch (error) {
            this.logger.warn(
                `Счётчики телефонии для стиля ${ctx.domain} за ` +
                    `${ctx.monthKey} не загружены: ${(error as Error).message}; ` +
                    'оси persistence/tempo/rhythm молчат',
            );
            return { managers: [], degraded: true };
        }
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
