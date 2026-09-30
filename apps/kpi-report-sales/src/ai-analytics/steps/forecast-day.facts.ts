/**
 * Прогнозы дня по менеджерам для шагов Фазы 4 (поток B2b): прогноз отдела
 * (`department-forecast`) и журнал советов (`recommendation-log`).
 *
 * Основной источник — шина прогона (`forecastDay`, пишет шаг прогноза).
 * Если шага прогноза в прогоне не было (ручной пересчёт одного шага из
 * админки белым списком `steps`), прогнозы дня читаются из `ais` по ключу
 * дня: те же записи, которые шаг прогноза положил ночью.
 *
 * Чужая или неполная форма читается структурно и отбрасывается, прогон не
 * падает (штатная деградация §5.4). Без DI, Bitrix и `new Date()`.
 */
import { AI_ANALYTICS_SNAPSHOT_TYPE } from '@lib/sales-ai-analytics';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import type { ForecastPayload } from '../domain/assembler/forecast.types';
import type {
    AiAnalyticsSnapshotRecord,
    AiAnalyticsSnapshotStore,
} from '../store/ai-analytics-snapshot.store';
import type { ForecastDayBusEntry, ForecastDayManager } from './forecast.step';
import type { AiPipelineStepContext, StepBus } from './step.types';

type Unknown = Record<string, unknown>;

const isObject = (value: unknown): value is Unknown =>
    typeof value === 'object' && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

/** Нагрузка прогноза менеджера пригодна: числа прогноза и список советов. */
export function isForecastPayload(value: unknown): value is ForecastPayload {
    return (
        isObject(value) &&
        typeof value.day === 'string' &&
        typeof value.monthKey === 'string' &&
        isFiniteNumber(value.p50) &&
        isFiniteNumber(value.doneSales) &&
        isFiniteNumber(value.naive) &&
        isFiniteNumber(value.descriptive) &&
        Array.isArray(value.levers)
    );
}

/** Прогнозы менеджеров ростера — в порядке ростера, чужие отброшены. */
function rosterManagers(
    managers: readonly ForecastDayManager[],
    roster: readonly string[],
): ForecastDayManager[] {
    const byId = new Map(
        managers.map(manager => [manager.managerId, manager] as const),
    );

    return roster.flatMap(managerId => {
        const found = byId.get(managerId);
        return found === undefined ? [] : [found];
    });
}

/** Значение шины за день прогона; чужой день или форма → null. */
export function forecastDayFromBus(
    value: unknown,
    ctx: Pick<AiPipelineStepContext, 'day' | 'managerIds'>,
): ForecastDayBusEntry | null {
    if (!isObject(value) || value.day !== ctx.day) return null;
    if (typeof value.monthKey !== 'string') return null;
    if (!Array.isArray(value.managers)) return null;
    const managers = (value.managers as unknown[]).flatMap(item =>
        isObject(item) &&
        typeof item.managerId === 'string' &&
        isForecastPayload(item.payload)
            ? [{ managerId: item.managerId, payload: item.payload }]
            : [],
    );
    const modelSnapshotId =
        typeof value.modelSnapshotId === 'string'
            ? value.modelSnapshotId
            : null;

    return {
        day: value.day,
        monthKey: value.monthKey,
        modelSnapshotId,
        managers: rosterManagers(managers, ctx.managerIds.map(String)),
    };
}

/** Прогнозы дня из записей `ais` (одна актуальная на менеджера). */
export function forecastDayFromRecords(
    records: readonly AiAnalyticsSnapshotRecord[],
    ctx: Pick<AiPipelineStepContext, 'day' | 'monthKey' | 'managerIds'>,
): ForecastDayBusEntry | null {
    const managers = records.flatMap(record =>
        record.managerId !== null &&
        record.periodKey === ctx.day &&
        isForecastPayload(record.payload)
            ? [{ managerId: record.managerId, payload: record.payload }]
            : [],
    );
    if (managers.length === 0) return null;
    const ordered = rosterManagers(managers, ctx.managerIds.map(String));

    return {
        day: ctx.day,
        monthKey: ctx.monthKey,
        modelSnapshotId: ordered[0]?.payload.meta?.modelSnapshotId ?? null,
        managers: ordered,
    };
}

/**
 * Прогнозы дня: шина прогона, а без неё — записи `ais` за день прогона.
 * null — прогнозов нет ни там, ни там.
 */
export async function loadForecastDay(
    ctx: AiPipelineStepContext,
    bus: StepBus,
    snapshots: Pick<AiAnalyticsSnapshotStore, 'findByKeys'>,
): Promise<ForecastDayBusEntry | null> {
    const fromBus = forecastDayFromBus(
        bus.get(AI_PIPELINE_BUS_KEYS.forecastDay),
        ctx,
    );
    if (fromBus !== null) return fromBus;
    const records = await snapshots.findByKeys(
        ctx.domain,
        AI_ANALYTICS_SNAPSHOT_TYPE.forecast,
        {
            periodKeys: [ctx.day],
            managerIds: ctx.managerIds.map(String),
            latestOnly: true,
        },
    );

    return forecastDayFromRecords(records, ctx);
}
