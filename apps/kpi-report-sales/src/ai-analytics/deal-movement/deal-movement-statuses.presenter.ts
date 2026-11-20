/**
 * Статусы витрины «Движение сделок» (п. 1 постановки §7): последняя ночь
 * периода по отделу и менеджерам и динамика по ночам. Чистые функции над
 * ночными снимками; периметр — правило видимости.
 */
import {
    DEAL_MOVEMENT_STATUS_TITLES,
    DEAL_MOVEMENT_STATUSES,
    emptyDealMovementStatusSums,
    isDealMovementAlarm,
    type DealMovementSnapshotView,
    type DealMovementStatusSums,
} from '@lib/sales-ai-analytics';
import { DEAL_MOVEMENT_TEXTS } from './deal-movement-vitrina.const';
import type { DealMovementScope } from './deal-movement-scope';
import type {
    DealMovementManagerStatusesDto,
    DealMovementNightDto,
    DealMovementStatusCellDto,
    DealMovementStatusesDto,
} from './dto/deal-movement-statuses.dto';

/** Счёт и сумма → ячейки в постоянном порядке; без сумм — amountSum null. */
export function statusCellsOf(
    sums: DealMovementStatusSums,
    withAmounts = true,
): DealMovementStatusCellDto[] {
    return DEAL_MOVEMENT_STATUSES.map(status => ({
        status,
        title: DEAL_MOVEMENT_STATUS_TITLES[status],
        count: sums[status].count,
        amountSum: withAmounts ? sums[status].amountSum : null,
    }));
}

/** Сумма разреза по видимым менеджерам. */
function sumVisible(
    byManager: Record<string, DealMovementStatusSums>,
    scope: DealMovementScope,
): DealMovementStatusSums {
    const total = emptyDealMovementStatusSums();
    for (const [managerId, sums] of Object.entries(byManager)) {
        if (!scope.visible(managerId)) continue;
        for (const status of DEAL_MOVEMENT_STATUSES) {
            total[status].count += sums[status].count;
            total[status].amountSum += sums[status].amountSum;
        }
    }
    return total;
}

/**
 * Итог отдела за ночь: видит всех без фильтра — итог портала (у формы 1
 * — только счёт); иначе — сумма разреза по видимым менеджерам (у формы 1
 * разреза нет — null).
 */
export function departmentCellsOf(
    night: DealMovementSnapshotView,
    scope: DealMovementScope,
): DealMovementStatusCellDto[] | null {
    if (scope.whole) {
        if (night.totals !== null) return statusCellsOf(night.totals);
        const counts = emptyDealMovementStatusSums();
        for (const status of DEAL_MOVEMENT_STATUSES) {
            counts[status].count = night.byStatus[status];
        }
        return statusCellsOf(counts, false);
    }
    return night.byManager === null
        ? null
        : statusCellsOf(sumVisible(night.byManager, scope));
}

/** Менеджеры на последнюю ночь: больше проблемных — выше. */
function managersOf(
    night: DealMovementSnapshotView,
    scope: DealMovementScope,
    names: Readonly<Record<string, string>>,
): DealMovementManagerStatusesDto[] {
    return Object.entries(night.byManager ?? {})
        .filter(([managerId]) => scope.visible(managerId))
        .map(([managerId, sums]) => {
            let total = 0;
            let problemCount = 0;
            let problemAmountSum = 0;
            for (const status of DEAL_MOVEMENT_STATUSES) {
                total += sums[status].count;
                if (!isDealMovementAlarm(status)) continue;
                problemCount += sums[status].count;
                problemAmountSum += sums[status].amountSum;
            }
            return {
                managerId,
                managerName: names[managerId] ?? null,
                cells: statusCellsOf(sums),
                total,
                problemCount,
                problemAmountSum,
            };
        })
        .sort(
            (a, b) =>
                b.problemCount - a.problemCount ||
                b.problemAmountSum - a.problemAmountSum ||
                Number(a.managerId) - Number(b.managerId),
        );
}

function nightOf(
    night: DealMovementSnapshotView,
    scope: DealMovementScope,
): DealMovementNightDto {
    return {
        day: night.day,
        form: night.form,
        department: departmentCellsOf(night, scope),
        managers: Object.entries(night.byManager ?? {})
            .filter(([managerId]) => scope.visible(managerId))
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([managerId, sums]) => ({
                managerId,
                cells: statusCellsOf(sums),
            })),
    };
}

/** Блок статусов за период: последняя ночь и динамика. */
export function presentDealMovementStatuses(input: {
    nights: readonly DealMovementSnapshotView[];
    from: string;
    to: string;
    scope: DealMovementScope;
    names: Readonly<Record<string, string>>;
}): DealMovementStatusesDto {
    const inPeriod = input.nights
        .filter(night => night.day >= input.from && night.day <= input.to)
        .sort((a, b) => a.day.localeCompare(b.day));
    const latest = inPeriod.at(-1) ?? null;
    const notes: string[] = [];
    if (latest === null) notes.push(DEAL_MOVEMENT_TEXTS.noSnapshots);
    if (inPeriod.some(night => night.form < 2)) {
        notes.push(DEAL_MOVEMENT_TEXTS.oldSnapshots);
    }
    return {
        day: latest?.day ?? null,
        generatedAt: latest?.generatedAt ?? null,
        department:
            (latest === null ? null : departmentCellsOf(latest, input.scope)) ??
            statusCellsOf(emptyDealMovementStatusSums(), false),
        managers:
            latest === null ? [] : managersOf(latest, input.scope, input.names),
        nights: inPeriod.map(night => nightOf(night, input.scope)),
        notes,
    };
}
