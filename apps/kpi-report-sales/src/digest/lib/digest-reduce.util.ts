/**
 * Редукция записей дня в счётчики по сотрудникам. Чистые функции — без
 * Битрикса и кэша, покрыты юнит-тестами.
 *
 * Семантика (см. план): plan — новый план, pound — перенос (и план на
 * будущее), done — результативно, act_noresult_fail — не состоялось,
 * expired — просрочено, act_send у документных типов — отправка документа,
 * done у ev_success/ev_fail — продажа/отказ. Клоны уникальных презентаций
 * исключаются (дубль записи presentation).
 */
import type { IsoDate } from '../../shared/lib/month-segments.util';
import {
    KPI_DIGEST_ACTIONS,
    KPI_DIGEST_EXCLUDED_TYPE_CODES,
    KPI_DIGEST_FAIL_TYPE_CODE,
    KPI_DIGEST_PLAN_ACTION_CODES,
    KPI_DIGEST_SUCCESS_TYPE_CODE,
} from '../constants/digest.const';
import type {
    KpiDigestCountDto,
    KpiDigestCountersDto,
    KpiDigestRecordDto,
} from '../dto/digest-response.dto';
import type {
    DigestDayPartition,
    DigestDayUserPartition,
    DigestPlannedPartition,
    DigestPlannedUserPartition,
} from '../types/digest-partition.type';
import { typeGroupOf } from './digest-type-group.util';

const EXCLUDED_TYPES = new Set<string>(KPI_DIGEST_EXCLUDED_TYPE_CODES);
const PLAN_ACTIONS = new Set<string>(KPI_DIGEST_PLAN_ACTION_CODES);

export const emptyCount = (): KpiDigestCountDto => ({ total: 0, byType: {} });

export const emptyCounters = (): KpiDigestCountersDto => ({
    plannedAtStart: emptyCount(),
    planned: emptyCount(),
    plannedBeyond: emptyCount(),
    done: emptyCount(),
    notHeld: emptyCount(),
    postponed: emptyCount(),
    expired: emptyCount(),
    documents: emptyCount(),
    sales: 0,
    refusals: 0,
    noresultReasons: {},
});

const UNKNOWN_TYPE = 'unknown';

export const bumpCount = (count: KpiDigestCountDto, type: string | null): void => {
    const key = type || UNKNOWN_TYPE;
    count.total += 1;
    count.byType[key] = (count.byType[key] ?? 0) + 1;
};

export const addCount = (target: KpiDigestCountDto, source: KpiDigestCountDto): void => {
    target.total += source.total;
    for (const [type, value] of Object.entries(source.byType)) {
        target.byType[type] = (target.byType[type] ?? 0) + value;
    }
};

const addRecordMap = (
    target: Record<string, number>,
    source: Record<string, number>,
): void => {
    for (const [key, value] of Object.entries(source)) {
        target[key] = (target[key] ?? 0) + value;
    }
};

/** Σ счётчиков (сводка «по всем»). */
export const addCounters = (
    target: KpiDigestCountersDto,
    source: KpiDigestCountersDto,
): void => {
    addCount(target.plannedAtStart, source.plannedAtStart);
    addCount(target.planned, source.planned);
    addCount(target.plannedBeyond, source.plannedBeyond);
    addCount(target.done, source.done);
    addCount(target.notHeld, source.notHeld);
    addCount(target.postponed, source.postponed);
    addCount(target.expired, source.expired);
    addCount(target.documents, source.documents);
    target.sales += source.sales;
    target.refusals += source.refusals;
    addRecordMap(target.noresultReasons, source.noresultReasons);
};

/** Дедлайн плана позже конца дня (сравнение дат в строках YYYY-MM-DD). */
export const isPlannedBeyondDay = (
    planDate: string | null,
    date: IsoDate,
): boolean => !!planDate && planDate.slice(0, 10) > date;

/** Запись не участвует в счётчиках: без ответственного или дедуп-клон. */
export const isCountableRecord = (record: KpiDigestRecordDto): boolean =>
    record.userId > 0 && !EXCLUDED_TYPES.has(record.typeCode ?? '');

/** Применить одну запись дня к счётчикам сотрудника. */
export function applyRecord(
    counters: KpiDigestCountersDto,
    record: KpiDigestRecordDto,
    date: IsoDate,
): void {
    const { typeCode, actionCode } = record;
    const group = typeGroupOf(typeCode);

    if (group === 'outcome') {
        if (actionCode !== KPI_DIGEST_ACTIONS.DONE) return;
        if (typeCode === KPI_DIGEST_SUCCESS_TYPE_CODE) counters.sales += 1;
        if (typeCode === KPI_DIGEST_FAIL_TYPE_CODE) counters.refusals += 1;
        return;
    }

    if (group === 'document') {
        if (actionCode === KPI_DIGEST_ACTIONS.ACT_SEND) {
            bumpCount(counters.documents, typeCode);
        }
        return;
    }

    switch (actionCode) {
        case KPI_DIGEST_ACTIONS.PLAN:
            bumpCount(counters.planned, typeCode);
            break;
        case KPI_DIGEST_ACTIONS.POUND:
            bumpCount(counters.postponed, typeCode);
            break;
        case KPI_DIGEST_ACTIONS.DONE:
            bumpCount(counters.done, typeCode);
            break;
        case KPI_DIGEST_ACTIONS.NOT_HELD:
            bumpCount(counters.notHeld, typeCode);
            break;
        case KPI_DIGEST_ACTIONS.EXPIRED:
            bumpCount(counters.expired, typeCode);
            break;
        default:
            return;
    }

    if (
        PLAN_ACTIONS.has(actionCode ?? '') &&
        isPlannedBeyondDay(record.planDate, date)
    ) {
        bumpCount(counters.plannedBeyond, typeCode);
    }

    if (
        (actionCode === KPI_DIGEST_ACTIONS.NOT_HELD ||
            actionCode === KPI_DIGEST_ACTIONS.POUND) &&
        record.noresultReason
    ) {
        counters.noresultReasons[record.noresultReason] =
            (counters.noresultReasons[record.noresultReason] ?? 0) + 1;
    }
}

const byEventDate = (a: KpiDigestRecordDto, b: KpiDigestRecordDto): number =>
    (a.eventDate ?? '').localeCompare(b.eventDate ?? '') ||
    Number(a.id) - Number(b.id);

export interface ReduceMeta {
    elements: number;
    truncated: boolean;
    builtAt: string;
}

/** События дня → партиция по сотрудникам. */
export function reduceDayRecords(
    date: IsoDate,
    records: readonly KpiDigestRecordDto[],
    meta: ReduceMeta,
): DigestDayPartition {
    const byUser: Record<string, DigestDayUserPartition> = {};
    for (const record of records) {
        if (!isCountableRecord(record)) continue;
        const key = String(record.userId);
        const user = (byUser[key] ??= { counters: emptyCounters(), records: [] });
        applyRecord(user.counters, record, date);
        user.records.push(record);
    }
    for (const user of Object.values(byUser)) {
        user.records.sort(byEventDate);
    }
    return {
        date,
        byUser,
        usersCount: Object.keys(byUser).length,
        elements: meta.elements,
        truncated: meta.truncated,
        builtAt: meta.builtAt,
    };
}

const byPlanDate = (a: KpiDigestRecordDto, b: KpiDigestRecordDto): number =>
    (a.planDate ?? '').localeCompare(b.planDate ?? '') ||
    Number(a.id) - Number(b.id);

/**
 * «Запланировано на начало дня» → партиция по сотрудникам. Выборка уже
 * отфильтрована Битриксом по действию/дедлайну; здесь — страховка по
 * действию (кривой слепок) и отсев клонов.
 */
export function reducePlannedRecords(
    date: IsoDate,
    records: readonly KpiDigestRecordDto[],
    meta: ReduceMeta,
): DigestPlannedPartition {
    const byUser: Record<string, DigestPlannedUserPartition> = {};
    for (const record of records) {
        if (!isCountableRecord(record)) continue;
        if (record.actionCode && !PLAN_ACTIONS.has(record.actionCode)) continue;
        if (record.planDate && record.planDate.slice(0, 10) !== date) continue;
        const key = String(record.userId);
        const user = (byUser[key] ??= { count: emptyCount(), records: [] });
        bumpCount(user.count, record.typeCode);
        user.records.push(record);
    }
    for (const user of Object.values(byUser)) {
        user.records.sort(byPlanDate);
    }
    return {
        date,
        byUser,
        elements: meta.elements,
        truncated: meta.truncated,
        builtAt: meta.builtAt,
    };
}
