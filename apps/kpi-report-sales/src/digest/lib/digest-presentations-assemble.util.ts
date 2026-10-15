/**
 * Сборка презентаций и продаж дня для ответа: отбор по запрошенным
 * сотрудникам и комментарии из записей списка KPI, привязанных к сделке
 * презентации (`D_{id}` в CRM-ссылках записи).
 *
 *  - комментарий при планировании — запись plan/pound (на день её ставили
 *    заранее — она в партиции «план на день»; спонтанная — в событиях дня);
 *  - комментарий после отработки — запись дня done / act_noresult_fail /
 *    pound; по ней же уточняется статус: менеджер отчитался, а стадия
 *    сделки ещё не сменилась.
 */
import { KPI_DIGEST_PRESENTATION_TYPE_CODE } from '../constants/digest.const';
import type {
    KpiDigestPresentationDto,
    KpiDigestPresentationsDto,
} from '../dto/digest-presentations.dto';
import type { KpiDigestRecordDto } from '../dto/digest-response.dto';
import type {
    DigestDayPartition,
    DigestPlannedPartition,
} from '../types/digest-partition.type';
import type { DigestPresentationsPartition } from '../types/digest-presentations.type';

const PLAN_ACTIONS = new Set(['plan', 'pound']);
const REPORT_ACTIONS = new Set(['done', 'act_noresult_fail', 'pound']);

/** Записи презентаций по ID сделки из CRM-ссылок. */
export function indexPresentationRecords(
    records: readonly KpiDigestRecordDto[],
): Map<number, KpiDigestRecordDto[]> {
    const index = new Map<number, KpiDigestRecordDto[]>();
    for (const record of records) {
        if (record.typeCode !== KPI_DIGEST_PRESENTATION_TYPE_CODE) continue;
        for (const ref of record.crmRefs) {
            const match = /^D_(\d+)$/.exec(ref);
            if (!match) continue;
            const id = Number(match[1]);
            const list = index.get(id) ?? [];
            list.push(record);
            index.set(id, list);
        }
    }
    return index;
}

const latest = (records: readonly KpiDigestRecordDto[]): KpiDigestRecordDto | null =>
    records.reduce<KpiDigestRecordDto | null>(
        (best, record) =>
            !best || (record.eventDate ?? '') > (best.eventDate ?? '') ? record : best,
        null,
    );

/** Комментарии и уточнение статуса одной презентации по записям списка. */
export function withRecords(
    item: KpiDigestPresentationDto,
    dayRecords: readonly KpiDigestRecordDto[],
    plannedRecords: readonly KpiDigestRecordDto[],
): KpiDigestPresentationDto {
    const report = latest(dayRecords.filter(record => REPORT_ACTIONS.has(record.actionCode ?? '')));
    const plan =
        latest(plannedRecords.filter(record => PLAN_ACTIONS.has(record.actionCode ?? ''))) ??
        latest(
            dayRecords.filter(
                record =>
                    record.actionCode === 'plan' &&
                    (!report || (record.eventDate ?? '') <= (report.eventDate ?? '')),
            ),
        );

    let dayStatus = item.dayStatus;
    if (report && dayStatus === 'pending') {
        if (report.actionCode === 'done') dayStatus = 'held';
        else if (report.actionCode === 'act_noresult_fail') dayStatus = 'notHeld';
        else if (report.actionCode === 'pound') dayStatus = 'postponed';
    }

    const hourOfReport = report?.eventDate ? Number(report.eventDate.slice(11, 13)) : null;
    return {
        ...item,
        dayStatus,
        hour:
            dayStatus !== item.dayStatus && Number.isFinite(hourOfReport)
                ? hourOfReport
                : item.hour,
        planComment: plan?.comment || null,
        reportComment: report?.comment || null,
        noresultReason: report?.noresultReason ?? null,
    };
}

export interface AssemblePresentationsInput {
    partition: DigestPresentationsPartition;
    day: DigestDayPartition;
    planned: DigestPlannedPartition;
    /** Запрошенные сотрудники; пусто — все. */
    userIds: ReadonlySet<number>;
}

export function assemblePresentations(input: AssemblePresentationsInput): KpiDigestPresentationsDto {
    const { partition, day, planned, userIds } = input;
    const allowed = (id: number) => !userIds.size || userIds.has(id);

    const dayIndex = indexPresentationRecords(
        Object.values(day.byUser).flatMap(user => user.records),
    );
    const plannedIndex = indexPresentationRecords(
        Object.values(planned.byUser).flatMap(user => user.records),
    );

    const items = partition.items
        .filter(item => allowed(item.assignedId))
        .map(item =>
            withRecords(item, dayIndex.get(item.dealId) ?? [], plannedIndex.get(item.dealId) ?? []),
        )
        .sort(
            (a, b) =>
                (a.hour ?? 99) - (b.hour ?? 99) || a.assignedId - b.assignedId || a.dealId - b.dealId,
        );

    return {
        items,
        sales: partition.sales.filter(sale => allowed(sale.assignedId)),
        truncated: partition.truncated,
    };
}
