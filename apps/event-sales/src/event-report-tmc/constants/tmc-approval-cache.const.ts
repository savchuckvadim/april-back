/**
 * Метки согласования заявок ТМЦ в AppCache (Redis + app_cache в MySQL).
 *
 * Зачем отдельно от статуса операции: статус живёт час, а подстраховка по
 * крону смотрит на трое суток назад и должна знать «это согласование уже
 * принимали» независимо от того, что менеджеры успели переписать в
 * карточках. Метку пишут оба пути — робот и крон — по одному id операции.
 */
export const TMC_APPROVAL_CACHE_APP = 'event-sales-tmc-approval';

/** Метки живут дольше любого окна просмотра подстраховки (72 ч по умолчанию). */
export const TMC_APPROVAL_MARKER_TTL_SECONDS = 30 * 24 * 60 * 60;

/** «Согласование принято» — по id операции (ТМЦ-сделка + менеджер + минута даты). */
export const acceptedApprovalKey = (operationId: string): string =>
    `accepted:${operationId}`;

/** Попытки подстраховки по элементу РПА. */
export const attemptMarkerKey = (rpaItemId: number): string =>
    `attempt:${rpaItemId}`;

/** Заявка без обязательных полей — предупреждение уже было. */
export const invalidMarkerKey = (rpaItemId: number): string =>
    `invalid:${rpaItemId}`;

/** Кто поставил согласование — для логов и метки. */
export type TmcApprovalSource = 'робот' | 'подстраховка';

export interface TmcApprovalAcceptedMarker {
    /** ISO-момент постановки в очередь. */
    acceptedAt: string;
    source: TmcApprovalSource;
}
