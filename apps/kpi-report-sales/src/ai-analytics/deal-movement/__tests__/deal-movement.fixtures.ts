import {
    emptyDealMovementStatusSums,
    type DealMovementSnapshotView,
    type DealMovementStatus,
    type DealMovementStatusSums,
} from '@lib/sales-ai-analytics';
import type { RequesterAccess } from '../../domain/access/perimeter.util';
import type { DealMovementCallPoint } from '../deal-movement-vitrina.types';

/** Руководитель, который видит всех. */
export const CUP: RequesterAccess = { role: 'cup', visibleManagerIds: null };

/** Руководитель отдела: видит себя (10) и менеджеров 447 и 512. */
export const OP: RequesterAccess = {
    role: 'op',
    visibleManagerIds: ['10', '447', '512'],
};

/** Менеджер: только себя. */
export const MANAGER: RequesterAccess = {
    role: 'manager',
    visibleManagerIds: ['447'],
};

/** Счёт и сумма: { статус: [count, amountSum] }. */
export const sums = (
    values: Partial<Record<DealMovementStatus, [number, number]>>,
): DealMovementStatusSums => {
    const result = emptyDealMovementStatusSums();
    for (const [status, [count, amountSum]] of Object.entries(values) as [
        DealMovementStatus,
        [number, number],
    ][]) {
        result[status] = { count, amountSum };
    }
    return result;
};

/** Снимок ночи формы 2; поля можно переопределить. */
export const night = (
    day: string,
    fields: Partial<DealMovementSnapshotView> = {},
): DealMovementSnapshotView => ({
    day,
    generatedAt: `${day}T00:40:00.000Z`,
    form: 2,
    openTotal: 0,
    evaluated: 0,
    byStatus: {
        rolled_back: 0,
        abandoned: 0,
        stuck: 0,
        at_risk: 0,
        moving: 0,
    },
    totals: null,
    byManager: null,
    progressChecks: [],
    progressCheckDays: 12,
    ...fields,
});

/** Звонок периода с продвижением. */
export const call = (
    transcriptionId: string,
    fields: Partial<DealMovementCallPoint> = {},
): DealMovementCallPoint => ({
    transcriptionId,
    managerId: '447',
    at: '2026-11-03T10:00:00.000Z',
    score: 7.5,
    progress: 4,
    ...fields,
});
