/**
 * Разбор нагрузок снапшотов для пакета AI-резюме: сборщик читает чужие
 * записи `ais` (их пишет ночной конвейер), поэтому форма проверяется
 * guard'ами, а нераспознанная запись отбрасывается — резюме не должно
 * падать из-за снапшота прошлой версии (§5.4 «штатная деградация»).
 *
 * Чистые функции: без DI, Bitrix и времени.
 */
import type { ForecastPayload } from '../domain/assembler/forecast.types';
import type {
    ManagerMonthPayload,
    ManagerWeekPayload,
} from '../domain/assembler/manager-snapshot.types';
import type { PortalModelPayload } from '../domain/assembler/portal-model.types';
import type { BriefManagerRow } from './evidence-pack.types';

/** Запись снапшота в объёме, который нужен сборщику пакета. */
export interface SnapshotRowLike {
    managerId: string | null;
    payload: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Недельный снапшот: флаги разборов и ячейки типов с чек-листами. */
export function isWeekPayload(payload: unknown): payload is ManagerWeekPayload {
    return (
        isRecord(payload) &&
        Array.isArray(payload.byType) &&
        Array.isArray(payload.flags)
    );
}

/** Месячный снапшот: типы звонков, рёбра воронки и финансовый хвост. */
export function isMonthPayload(
    payload: unknown,
): payload is ManagerMonthPayload {
    return (
        isRecord(payload) &&
        Array.isArray(payload.byType) &&
        Array.isArray(payload.edges) &&
        isRecord(payload.finance)
    );
}

/** Дневной прогноз: P50 и утечки рёбер. */
export function isForecastPayload(
    payload: unknown,
): payload is ForecastPayload {
    return (
        isRecord(payload) &&
        typeof payload.p50 === 'number' &&
        Array.isArray(payload.leaks)
    );
}

/** Модель портала: нормы рёбер и готовность витрины. */
export function isModelPayload(
    payload: unknown,
): payload is PortalModelPayload {
    return (
        isRecord(payload) &&
        Array.isArray(payload.edges) &&
        isRecord(payload.readiness)
    );
}

/** Записи с менеджером и распознанной нагрузкой; чужая форма отбрасывается. */
export function toBriefRows<T>(
    records: readonly SnapshotRowLike[],
    guard: (payload: unknown) => payload is T,
): BriefManagerRow<T>[] {
    const rows: BriefManagerRow<T>[] = [];
    for (const record of records) {
        if (record.managerId === null || !guard(record.payload)) continue;
        rows.push({ managerId: record.managerId, payload: record.payload });
    }

    return rows;
}
