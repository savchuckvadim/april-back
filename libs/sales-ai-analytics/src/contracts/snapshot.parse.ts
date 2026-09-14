/**
 * Разбор записей ais снапшотов AI-аналитики (план Фазы 2 §3.2, §5.1):
 * единственный вход для чтения чужих записей — сначала проверяется
 * конверт (тип из реестра, `user_result` в форме конверта), затем нагрузка
 * через переданный guard. Любая чужая форма → null, без исключений.
 *
 * Чистые функции без DI, Bitrix и Prisma. Раскладка конверта по колонкам
 * ais (activity_id, user_id, model) остаётся в приложении
 * (apps/kpi-report-sales/src/ai-analytics/store/snapshot-serialize.util.ts)
 * — она использует эти же разборы для `user_result`.
 */
import {
    AiAnalyticsSnapshotType,
    isAiAnalyticsSnapshotType,
} from './snapshot-kinds.const';
import type { AiSnapshotMeta } from './snapshot.types';

/** Guard нагрузки снапшота: подтверждает форму payload вызывающего. */
export type SnapshotPayloadGuard<T> = (value: unknown) => value is T;

/**
 * `user_result` записи снапшота: метаданные конверта и нагрузка
 * (SnapshotEnvelope без колонок ais). managerId строкой — ростер отдаёт
 * строковые id; null — портальная запись.
 */
export interface SnapshotUserResult<T = unknown> {
    managerId: string | null;
    paramsVersion: string;
    inputsHash: string;
    generatedAt: string;
    payload: T;
}

/** Минимум колонок ais, нужный разбору нагрузки: тип и user_result. */
export interface SnapshotRawRecord {
    type?: string | null;
    user_result?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | null =>
    typeof value === 'string' ? value : null;

const asNonEmptyString = (value: unknown): string | null => {
    const text = asString(value);
    return text !== null && text !== '' ? text : null;
};

/**
 * `user_result` → метаданные конверта и нагрузка; чужая форма → null.
 * Версии могут быть пустыми строками (журнал сбоя контекста), момент
 * формирования — нет; нагрузка обязана присутствовать (не null).
 */
export function parseSnapshotUserResult(
    value: unknown,
): SnapshotUserResult | null {
    if (!isRecord(value)) return null;
    const paramsVersion = asString(value.paramsVersion);
    const inputsHash = asString(value.inputsHash);
    const generatedAt = asNonEmptyString(value.generatedAt);
    if (paramsVersion === null || inputsHash === null || generatedAt === null) {
        return null;
    }
    if (value.payload === undefined || value.payload === null) return null;
    const managerId =
        value.managerId === null ? null : asNonEmptyString(value.managerId);
    return {
        managerId,
        paramsVersion,
        inputsHash,
        generatedAt,
        payload: value.payload,
    };
}

/**
 * Нагрузка записи ais: тип должен быть в реестре (и совпадать с
 * expectedType, если он задан), `user_result` — в форме конверта, а
 * payload — пройти guard. Иначе null: чужая запись не роняет читателя.
 */
export function parseSnapshotPayload<T>(
    record: SnapshotRawRecord,
    guard: SnapshotPayloadGuard<T>,
    expectedType?: AiAnalyticsSnapshotType,
): T | null {
    if (!isAiAnalyticsSnapshotType(record.type)) return null;
    if (expectedType !== undefined && record.type !== expectedType) return null;
    const userResult = parseSnapshotUserResult(record.user_result);
    if (userResult === null) return null;
    return guard(userResult.payload) ? userResult.payload : null;
}

/**
 * Версии расчёта в нагрузке (AiSnapshotMeta): строки версий, момент
 * расчёта, граница сравнимой истории и id модели портала (оба — string
 * либо null, отсутствие поля — чужая форма).
 */
export function isSnapshotMeta(value: unknown): value is AiSnapshotMeta {
    if (!isRecord(value)) return false;
    const nullableString = (field: unknown): boolean =>
        field === null || typeof field === 'string';
    return (
        typeof value.calcVersion === 'string' &&
        typeof value.paramsVersion === 'string' &&
        typeof value.generatedAt === 'string' &&
        value.generatedAt !== '' &&
        'comparableFrom' in value &&
        nullableString(value.comparableFrom) &&
        'modelSnapshotId' in value &&
        nullableString(value.modelSnapshotId)
    );
}

/** `payload.meta` записи → AiSnapshotMeta; чужая форма → null. */
export function parseSnapshotMeta(value: unknown): AiSnapshotMeta | null {
    return isSnapshotMeta(value)
        ? {
              calcVersion: value.calcVersion,
              paramsVersion: value.paramsVersion,
              comparableFrom: value.comparableFrom,
              generatedAt: value.generatedAt,
              modelSnapshotId: value.modelSnapshotId,
          }
        : null;
}
