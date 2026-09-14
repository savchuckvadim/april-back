/**
 * Раскладка снапшота Фазы 2 по колонкам ais и обратно (план 5.1–5.2):
 * конверт SnapshotEnvelope ↔ запись ais. Чистые функции без DI, Bitrix и
 * Prisma. Ключ периода (activity_id) зависит от зерна типа: 'YYYY-MM',
 * 'YYYY-Www' (ISO-неделя), 'YYYY-MM-DD' или хэш входов.
 *
 * Типы снапшотов, зёрна, дескрипторы ретенции и разбор `user_result`
 * (parseSnapshotUserResult) берутся из публичного API библиотеки
 * (@lib/sales-ai-analytics), глубоких путей нет.
 */
import { createHash } from 'node:crypto';
import {
    AI_ANALYTICS_SNAPSHOT_APP,
    AI_ANALYTICS_SNAPSHOT_PROVIDER,
    AI_ANALYTICS_SNAPSHOT_STATUS,
    AiAnalyticsSnapshotGrain,
    AiAnalyticsSnapshotStatus,
    AiAnalyticsSnapshotType,
    isAiAnalyticsSnapshotStatus,
    isAiAnalyticsSnapshotType,
    isManagerGrain,
    parseSnapshotUserResult,
    SnapshotEnvelope,
    snapshotGrain,
    SnapshotUserResult,
} from '@lib/sales-ai-analytics';
import { isoWeekKey } from '../domain/loaders/period.util';

/** user_result записи снапшота: метаданные конверта и нагрузка (форма lib). */
export type AiSnapshotUserResult<T = unknown> = SnapshotUserResult<T>;

/** Колонки ais одной записи снапшота (вход AiService.create). */
export interface AiSnapshotAisRecord<T = unknown> {
    provider: string;
    app: string;
    type: AiAnalyticsSnapshotType;
    /** managerId числом; null — портальное зерно или нечисловой id. */
    user_id: number | null;
    /** Ключ периода. */
    activity_id: string;
    /** calcVersion. */
    model: string;
    user_result: AiSnapshotUserResult<T>;
    status: AiAnalyticsSnapshotStatus;
    domain: string;
}

/** Запись ais в том виде, в каком её отдаёт AiEntityDto (частично). */
export interface AiSnapshotRawRecord {
    type?: string | null;
    activity_id?: string | null;
    model?: string | null;
    status?: string | null;
    domain?: string | null;
    user_id?: number | null;
    user_result?: unknown;
}

/**
 * Формы ключа периода по зерну. portal-hash допускает и хэш входов, и
 * именованный ключ набора (настройки витрины) — лишь бы без пробелов.
 */
export const AI_ANALYTICS_SNAPSHOT_KEY_PATTERNS: Record<
    AiAnalyticsSnapshotGrain,
    RegExp
> = {
    'manager-week': /^\d{4}-W\d{2}$/,
    'manager-month': /^\d{4}-\d{2}$/,
    'portal-week': /^\d{4}-W\d{2}$/,
    'portal-month': /^\d{4}-\d{2}$/,
    'manager-day': /^\d{4}-\d{2}-\d{2}$/,
    'portal-day': /^\d{4}-\d{2}-\d{2}$/,
    'portal-hash': /^[A-Za-z0-9_.:-]{1,64}$/,
};

/** Длина ключа-хэша (portal-hash): 16 hex-символов sha1. */
export const AI_ANALYTICS_SNAPSHOT_HASH_LENGTH = 16;

/**
 * Разделитель частей перед sha1: NUL не встречается в значениях, поэтому
 * склейка однозначна. Записан escape-последовательностью — литеральный
 * символ в исходнике ломает grep/diff (файл читается как бинарный).
 */
const SNAPSHOT_HASH_SEPARATOR = '\u0000';

const asString = (value: unknown): string | null =>
    typeof value === 'string' ? value : null;

const asNonEmptyString = (value: unknown): string | null => {
    const text = asString(value);
    return text !== null && text !== '' ? text : null;
};

/** Ключ периода соответствует форме зерна. */
export function isSnapshotPeriodKey(
    grain: AiAnalyticsSnapshotGrain,
    key: string,
): boolean {
    return AI_ANALYTICS_SNAPSHOT_KEY_PATTERNS[grain].test(key);
}

/**
 * Ключ периода по зерну из дня портала 'YYYY-MM-DD'. Для portal-hash
 * ключ строится из входов — snapshotHashKey.
 */
export function periodKeyOf(
    grain: Exclude<AiAnalyticsSnapshotGrain, 'portal-hash'>,
    day: string,
): string {
    switch (grain) {
        case 'manager-week':
        case 'portal-week':
            return isoWeekKey(day);
        case 'manager-month':
        case 'portal-month':
            return day.slice(0, 7);
        default:
            return day;
    }
}

/** Детерминированный ключ/хэш входов: sha1 по частям, 16 hex-символов. */
export function snapshotHashKey(parts: readonly string[]): string {
    return createHash('sha1')
        .update(parts.join(SNAPSHOT_HASH_SEPARATOR))
        .digest('hex')
        .slice(0, AI_ANALYTICS_SNAPSHOT_HASH_LENGTH);
}

/** managerId ростера → user_id ais; нечисловой или пустой → null. */
export function toManagerUserId(managerId: string | null): number | null {
    if (managerId === null || managerId === '') return null;
    const userId = Number(managerId);
    return Number.isInteger(userId) && userId > 0 ? userId : null;
}

/**
 * Менеджер записи по зерну типа: у портальных зёрен менеджера нет —
 * переданный отбрасывается. Так же ключ записи видит стор при поиске
 * прежних версий.
 */
export function snapshotManagerId(
    type: AiAnalyticsSnapshotType,
    managerId: string | null,
): string | null {
    return isManagerGrain(snapshotGrain(type)) ? managerId : null;
}

/** Статус ais-записи → статус снапшота; чужое значение → null. */
export function parseSnapshotStatus(
    value: unknown,
): AiAnalyticsSnapshotStatus | null {
    return isAiAnalyticsSnapshotStatus(value) ? value : null;
}

/** Конверт → колонки ais. Менеджер портального зерна отбрасывается. */
export function toAisRecord<T>(
    envelope: SnapshotEnvelope<T>,
    status: AiAnalyticsSnapshotStatus = AI_ANALYTICS_SNAPSHOT_STATUS.done,
): AiSnapshotAisRecord<T> {
    const managerId = snapshotManagerId(envelope.type, envelope.managerId);
    return {
        provider: AI_ANALYTICS_SNAPSHOT_PROVIDER,
        app: AI_ANALYTICS_SNAPSHOT_APP,
        type: envelope.type,
        user_id: toManagerUserId(managerId),
        activity_id: envelope.periodKey,
        model: envelope.calcVersion,
        user_result: {
            managerId,
            paramsVersion: envelope.paramsVersion,
            inputsHash: envelope.inputsHash,
            generatedAt: envelope.generatedAt,
            payload: envelope.payload,
        },
        status,
        domain: envelope.domain,
    };
}

/**
 * Запись ais → конверт снапшота; любая невалидная запись (чужой тип,
 * ключ не по зерну, битый user_result, менеджерский снапшот без
 * менеджера) → null, без исключений.
 */
export function fromAisRecord(
    record: AiSnapshotRawRecord,
): SnapshotEnvelope<unknown> | null {
    const type = record.type;
    if (!isAiAnalyticsSnapshotType(type)) return null;

    const domain = asNonEmptyString(record.domain);
    const periodKey = asNonEmptyString(record.activity_id);
    const calcVersion = asString(record.model);
    if (domain === null || periodKey === null || calcVersion === null) {
        return null;
    }

    const grain = snapshotGrain(type);
    if (!isSnapshotPeriodKey(grain, periodKey)) return null;
    if (parseSnapshotStatus(record.status) === null) return null;

    const meta = parseSnapshotUserResult(record.user_result);
    if (meta === null) return null;

    const managerId = isManagerGrain(grain)
        ? (meta.managerId ?? userIdToManagerId(record.user_id))
        : null;
    if (isManagerGrain(grain) && managerId === null) return null;

    return {
        domain,
        type,
        periodKey,
        managerId,
        calcVersion,
        paramsVersion: meta.paramsVersion,
        inputsHash: meta.inputsHash,
        generatedAt: meta.generatedAt,
        payload: meta.payload,
    };
}

/** user_id ais → managerId строкой; 0 и null — менеджера нет. */
function userIdToManagerId(userId: number | null | undefined): string | null {
    return typeof userId === 'number' && Number.isInteger(userId) && userId > 0
        ? String(userId)
        : null;
}
