/**
 * Шаг конвейера «паспорт менеджера» (план Фазы 2, поток 14a; план 4.6):
 * собирает паспорта ростера и кладёт их в шину под ключом `passport` —
 * недельные, месячные и модельные шаги берут оттуда полосу стажа, статус
 * и уровень, не импортируя файлы чужих потоков.
 *
 * Каскад даты начала работы живёт в загрузчике. Прокси-источник (третий
 * шаг каскада) собирает шаг: сначала первое событие телефонии из шины
 * (строки звонков соседнего шага), затем — первый месяц отчётности из
 * снапшотов `ai-analytics-manager-month`. Портал за прокси не опрашивается:
 * если ни одного источника нет, паспорт остаётся без даты, и норма
 * берётся слоем портала (штатная деградация §5.4).
 */
import { Injectable } from '@nestjs/common';
import { AI_ANALYTICS_SNAPSHOT_TYPE } from '@lib/sales-ai-analytics';
import type { ManagerPassport } from '@lib/sales-ai-analytics';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import {
    AI_PASSPORT_SKIP_REASONS,
    AI_PASSPORT_STEP_CODE,
    AI_PASSPORT_STEP_RHYTHMS,
} from '../constants/ai-passport.const';
import { ManagerPassportLoader } from '../domain/loaders/manager-passport.loader';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import {
    AiAnalyticsPipelineStep,
    AiPipelineStepContext,
    AiPipelineStepResult,
    StepBus,
    stepOk,
    stepSkipped,
} from './step.types';

/** Менеджер → дата первого события 'YYYY-MM-DD'. */
export type FirstEventMap = Record<string, string>;

const asRecord = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : null;

/** Дата строки звонка → 'YYYY-MM-DD'; чужая форма → null. */
function callDay(value: unknown): string | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }
    return typeof value === 'string' && value.length >= 10
        ? value.slice(0, 10)
        : null;
}

/** Минимум по менеджеру: ранняя дата побеждает. */
function keepEarliest(map: FirstEventMap, id: string, day: string): void {
    const known = map[id];
    if (!known || day < known) map[id] = day;
}

/**
 * Первое событие телефонии из шины: строки звонков соседнего шага. Чужая
 * или неполная форма молча отбрасывается — паспорт не должен падать из-за
 * шага, положившего в шину не то.
 */
export function firstEventsFromCalls(value: unknown): FirstEventMap {
    if (!Array.isArray(value)) return {};
    const map: FirstEventMap = {};
    for (const item of value) {
        const row = asRecord(item);
        const id = row ? row.managerId : null;
        const day = row ? callDay(row.callStartedAt) : null;
        if (!day || (typeof id !== 'string' && typeof id !== 'number')) {
            continue;
        }
        keepEarliest(map, String(id), day);
    }

    return map;
}

/** Первый месяц отчётности: 'YYYY-MM' снапшота → первое число месяца. */
export function firstEventsFromMonths(
    records: readonly { managerId: string | null; periodKey: string }[],
): FirstEventMap {
    const map: FirstEventMap = {};
    for (const record of records) {
        if (!record.managerId) continue;
        keepEarliest(map, record.managerId, `${record.periodKey}-01`);
    }

    return map;
}

/** Слияние источников прокси: ранняя дата побеждает. */
export function mergeFirstEvents(
    ...maps: readonly FirstEventMap[]
): FirstEventMap {
    const merged: FirstEventMap = {};
    for (const map of maps) {
        for (const [id, day] of Object.entries(map))
            keepEarliest(merged, id, day);
    }

    return merged;
}

@Injectable()
export class PassportStep implements AiAnalyticsPipelineStep {
    readonly code = AI_PASSPORT_STEP_CODE;
    readonly rhythms = AI_PASSPORT_STEP_RHYTHMS;

    constructor(
        private readonly passports: ManagerPassportLoader,
        private readonly snapshots: AiAnalyticsSnapshotStore,
    ) {}

    async run(
        ctx: AiPipelineStepContext,
        bus: StepBus,
    ): Promise<AiPipelineStepResult> {
        const startedAt = Date.now();
        if (!ctx.managerIds.length) {
            return stepSkipped(this.code, AI_PASSPORT_SKIP_REASONS.noRoster, {
                ms: Date.now() - startedAt,
            });
        }
        const first = await this.load(ctx, {});
        const result = await this.withProxy(ctx, bus, first);
        bus.set<ManagerPassport[]>(
            AI_PIPELINE_BUS_KEYS.passport,
            result.passports,
        );
        const values = {
            ms: Date.now() - startedAt,
            rows: result.passports.length,
            bitrixCalls: first.bitrixCalls,
        };

        return first.ok
            ? stepOk(this.code, values)
            : stepSkipped(this.code, AI_PASSPORT_SKIP_REASONS.noUsers, values);
    }

    /** Паспорта ростера на день прогона (стаж считается на эту дату). */
    private async load(
        ctx: AiPipelineStepContext,
        options: { firstEventAt?: FirstEventMap; forceRefresh?: boolean },
    ): Promise<Awaited<ReturnType<ManagerPassportLoader['load']>>> {
        return this.passports.load(ctx.domain, ctx.managerIds, {
            settings: ctx.settings,
            registry: ctx.registry,
            until: ctx.day,
            now: ctx.now,
            forceRefresh: options.forceRefresh ?? ctx.forceRefresh,
            ...(options.firstEventAt
                ? { firstEventAt: options.firstEventAt }
                : {}),
        });
    }

    /**
     * Третий шаг каскада: менеджерам без даты ищем первое событие. Второй
     * проход берёт факты портала из кэша первого (forceRefresh снят) —
     * лишних вызовов Bitrix не будет.
     */
    private async withProxy(
        ctx: AiPipelineStepContext,
        bus: StepBus,
        first: Awaited<ReturnType<ManagerPassportLoader['load']>>,
    ): Promise<Awaited<ReturnType<ManagerPassportLoader['load']>>> {
        const missing = first.passports
            .filter(passport => passport.since === null)
            .map(passport => passport.managerId);
        if (!missing.length) return first;

        const firstEventAt = mergeFirstEvents(
            firstEventsFromCalls(bus.get(AI_PIPELINE_BUS_KEYS.callsRows)),
            firstEventsFromMonths(await this.monthKeys(ctx, missing)),
        );
        const usable = missing.some(id => firstEventAt[id]);
        if (!usable) return first;

        const second = await this.load(ctx, {
            firstEventAt,
            forceRefresh: false,
        });

        return { ...second, bitrixCalls: first.bitrixCalls, ok: first.ok };
    }

    /** Ключи месяцев отчётности менеджеров без даты (окно стора). */
    private async monthKeys(
        ctx: AiPipelineStepContext,
        managerIds: readonly string[],
    ): Promise<{ managerId: string | null; periodKey: string }[]> {
        const records = await this.snapshots.findByKeys(
            ctx.domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            { managerIds: [...managerIds], now: ctx.now },
        );

        return records.map(record => ({
            managerId: record.managerId,
            periodKey: record.periodKey,
        }));
    }
}
