/**
 * Фактические звонки дня (строки voximplant.statistic.get) → партиция по
 * сотрудникам: итоги, направления, бакеты длительности (как в
 * calling-statistic) и почасовые корзины. Час берётся ЛИТЕРАЛЬНО из
 * CALL_START_DATE (строка в зоне портала) — без пересчёта в зону сервера.
 */
import type { IsoDate } from '../../shared/lib/month-segments.util';
import {
    VOX_INCOMING_CALL_TYPES,
    VOX_OUTGOING_CALL_TYPES,
    VoximplantAirtimeRow,
} from '../../airtime/types/airtime-statistic.type';
import {
    KPI_DIGEST_CALL_BUCKET_ALL,
    KPI_DIGEST_CALL_DURATION_BUCKETS,
    KPI_DIGEST_HOURS_IN_DAY,
} from '../constants/digest.const';
import type { KpiDigestCallsDto } from '../dto/digest-response.dto';
import type { DigestCallsPartition } from '../types/digest-partition.type';

export const emptyCalls = (): KpiDigestCallsDto => ({
    callsCount: 0,
    airtimeSeconds: 0,
    incoming: { count: 0, seconds: 0 },
    outgoing: { count: 0, seconds: 0 },
    byDuration: {
        [KPI_DIGEST_CALL_BUCKET_ALL]: 0,
        ...Object.fromEntries(
            KPI_DIGEST_CALL_DURATION_BUCKETS.map(bucket => [String(bucket), 0]),
        ),
    },
    byHour: Array.from({ length: KPI_DIGEST_HOURS_IN_DAY }, (_, hour) => ({
        hour,
        calls: 0,
        seconds: 0,
    })),
});

const HOUR_RE = /^\d{4}-\d{2}-\d{2}[T ](\d{2}):/;

/** Час начала звонка из строки даты портала; null — формат неизвестен. */
export function hourOfCallStart(value: string | undefined): number | null {
    const match = HOUR_RE.exec(String(value ?? '').trim());
    if (!match) return null;
    const hour = Number(match[1]);
    return hour >= 0 && hour < KPI_DIGEST_HOURS_IN_DAY ? hour : null;
}

const directionOf = (
    callType: VoximplantAirtimeRow['CALL_TYPE'],
): 'incoming' | 'outgoing' | null => {
    const type = Number(callType);
    if ((VOX_INCOMING_CALL_TYPES as readonly number[]).includes(type)) {
        return 'incoming';
    }
    if ((VOX_OUTGOING_CALL_TYPES as readonly number[]).includes(type)) {
        return 'outgoing';
    }
    return null;
};

export function addCallRow(cell: KpiDigestCallsDto, row: VoximplantAirtimeRow): void {
    const seconds = Number(row.CALL_DURATION) || 0;
    cell.callsCount += 1;
    cell.airtimeSeconds += seconds;

    const direction = directionOf(row.CALL_TYPE);
    if (direction) {
        cell[direction].count += 1;
        cell[direction].seconds += seconds;
    }

    cell.byDuration[KPI_DIGEST_CALL_BUCKET_ALL] += 1;
    for (const bucket of KPI_DIGEST_CALL_DURATION_BUCKETS) {
        // Как '>CALL_DURATION' в calling-statistic: строго дольше порога.
        if (seconds > bucket) cell.byDuration[String(bucket)] += 1;
    }

    const hour = hourOfCallStart(row.CALL_START_DATE);
    if (hour !== null) {
        const bucket = cell.byHour[hour];
        bucket.calls += 1;
        bucket.seconds += seconds;
    }
}

/** Σ звонков (сводка «по всем»). */
export function addCalls(target: KpiDigestCallsDto, source: KpiDigestCallsDto): void {
    target.callsCount += source.callsCount;
    target.airtimeSeconds += source.airtimeSeconds;
    target.incoming.count += source.incoming.count;
    target.incoming.seconds += source.incoming.seconds;
    target.outgoing.count += source.outgoing.count;
    target.outgoing.seconds += source.outgoing.seconds;
    for (const [bucket, value] of Object.entries(source.byDuration)) {
        target.byDuration[bucket] = (target.byDuration[bucket] ?? 0) + value;
    }
    for (const hour of source.byHour) {
        const own = target.byHour[hour.hour];
        if (!own) continue;
        own.calls += hour.calls;
        own.seconds += hour.seconds;
    }
}

export function reduceCallRows(
    date: IsoDate,
    rows: readonly VoximplantAirtimeRow[],
    meta: { truncated: boolean; builtAt: string },
): DigestCallsPartition {
    const byUser: Record<string, KpiDigestCallsDto> = {};
    for (const row of rows) {
        const userId = Number(row.PORTAL_USER_ID);
        if (!Number.isFinite(userId) || userId <= 0) continue;
        const key = String(userId);
        addCallRow((byUser[key] ??= emptyCalls()), row);
    }
    return {
        date,
        byUser,
        rowsFetched: rows.length,
        truncated: meta.truncated,
        builtAt: meta.builtAt,
    };
}
