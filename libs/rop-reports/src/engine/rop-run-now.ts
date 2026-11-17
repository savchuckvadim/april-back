import { ETimeZone } from '@lib/shared/lib/date';
import {
    lastClosedRopPeriod,
    RopPeriod,
    RopPeriodKind,
    ropPeriodByKey,
    ropPortalDay,
} from '../period/rop-period';

/** Ручной запуск периода (кнопка админки через очередь). */
export interface RopRunNowRequest {
    readonly domain: string;
    readonly kind: RopPeriodKind;
    /** Ключ периода; нет — последний закрытый период вида. */
    readonly periodKey?: string;
    /** Перебить «только считать» из настроек; нет — по настройке. */
    readonly countOnly?: boolean;
    /** Проба: весь отчёт одной задачей этому сотруднику. */
    readonly previewUserId?: number;
}

/**
 * Период ручного запуска: по ключу либо последний закрытый на сегодня
 * портала. Чужой ключ — ошибка с понятной причиной: запускать «что-то
 * похожее» нельзя.
 */
export function ropRequestedPeriod(
    request: Pick<RopRunNowRequest, 'kind' | 'periodKey'>,
    timezone: ETimeZone,
    now: Date,
): RopPeriod {
    if (request.periodKey === undefined) {
        return lastClosedRopPeriod(request.kind, ropPortalDay(now, timezone));
    }
    const period = ropPeriodByKey(request.kind, request.periodKey);
    if (!period) {
        throw new RangeError(
            `период «${request.periodKey}» не разобран — проверьте ключ периода`,
        );
    }
    return period;
}
