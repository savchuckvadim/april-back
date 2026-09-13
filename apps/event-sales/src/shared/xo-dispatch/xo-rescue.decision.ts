import { Dayjs } from 'dayjs';
import {
    isXoDispatchPending,
    XoDispatchMarkers,
} from './xo-dispatch-marker.model';

/** Что крон знает о кандидате перед решением. */
export interface XoRescueCandidate {
    /** Метки двухфазной подстраховки (робот пишет queued до вызова хука). */
    markers: XoDispatchMarkers;
    /** Плановая дата ХО из карточки (`xo_date`); null — не назначена. */
    xoDate: Dayjs | null;
    /**
     * Есть ли по клиенту ХО-работа, появившаяся НЕ РАНЬШЕ плановой даты.
     * Именно «не раньше»: старая, давно закрытая ХО-сделка не доказывает,
     * что отработал СЕГОДНЯШНИЙ вызов хука.
     */
    hasXoWorkSincePlan: boolean;
}

/** Пороговые времена прогона — считаются один раз на тик. */
export interface XoRescueThresholds {
    /** Сейчас (в TZ портала). */
    now: Dayjs;
    /** Маркер старше этого — хук считаем упавшим. */
    resendBefore: Dayjs;
    /** Раньше этого сирот не берём: слишком старое — не наш случай. */
    orphanNotBefore: Dayjs;
    /** Позже этого сирот не берём: хук, возможно, ещё обрабатывается. */
    orphanNotAfter: Dayjs;
}

export type XoRescueAction = 'dispatch' | 'skip';

export type XoRescueReason =
    /** Робот взял в очередь, но хук не доехал — досылаем. */
    | 'marker-stuck'
    /** Звонок назначен, а работы по нему не появилось — досылаем. */
    | 'orphan-xo-date'
    /** Маркер свежий: хук, вероятно, прямо сейчас обрабатывается. */
    | 'marker-fresh'
    /** Метки говорят «доставлено». */
    | 'delivered'
    /** Дата ХО не заполнена — цеплять не за что. */
    | 'no-plan-date'
    /** Плановая дата в будущем: звонок ещё не наступил. */
    | 'plan-ahead'
    /** Слишком свежая дата: даём хуку доработать. */
    | 'plan-too-fresh'
    /** Слишком старая дата: это не упавший хук, а история. */
    | 'plan-too-old'
    /** Работа по клиенту есть — всё отработало. */
    | 'work-exists';

export interface XoRescueVerdict {
    action: XoRescueAction;
    reason: XoRescueReason;
}

/**
 * Брать ли элемент в досылку — и почему.
 *
 * ДВА НЕЗАВИСИМЫХ ПРИЗНАКА, намеренно в таком порядке:
 *
 *  1. МАРКЕР (`queued_at` новее `sent_at`). Точный: его пишет робот прямо
 *     перед вызовом хука, поэтому «взяли в очередь, а подтверждения нет»
 *     означает ровно упавший хук. Требует, чтобы робот был доработан.
 *
 *  2. СИРОТА ПО `xo_date`. Приблизительный, зато не требует от робота
 *     ничего и ловит случай, когда робот до хука вообще не дошёл: звонок
 *     назначен, а работы по нему не появилось.
 *
 * Второй признак опаснее первого — им легко «назабирать лишнего», поэтому
 * он обвешан ограничениями с обеих сторон:
 *  - дата должна быть В ПРОШЛОМ (звонок наступил);
 *  - и не слишком свежей — иначе дожмём хук, который ещё обрабатывается;
 *  - и не слишком старой — иначе подметём всю историю клиентов, у которых
 *    ХО был давно и давно закрыт;
 *  - и по клиенту не должно быть ХО-работы, созданной с момента плана.
 * Любое сомнение трактуем как «не берём»: лишняя досылка уводит клиента у
 * работающего менеджера, а пропущенная — всего лишь ждёт следующего тика.
 */
export function decideXoRescue(
    candidate: XoRescueCandidate,
    thresholds: XoRescueThresholds,
): XoRescueVerdict {
    const { markers, xoDate, hasXoWorkSincePlan } = candidate;

    // --- Признак 1: маркер ------------------------------------------------
    if (isXoDispatchPending(markers)) {
        const queuedAt = markers.queuedAt;
        if (queuedAt && queuedAt.isAfter(thresholds.resendBefore)) {
            return { action: 'skip', reason: 'marker-fresh' };
        }
        return { action: 'dispatch', reason: 'marker-stuck' };
    }
    // Маркеры есть и говорят «доставлено» — второй признак не спрашиваем:
    // робот на этом портале доработан, и его слову верим.
    if (markers.sentAt) {
        return { action: 'skip', reason: 'delivered' };
    }

    // --- Признак 2: сирота по плановой дате --------------------------------
    if (!xoDate) return { action: 'skip', reason: 'no-plan-date' };
    if (xoDate.isAfter(thresholds.now)) {
        return { action: 'skip', reason: 'plan-ahead' };
    }
    if (xoDate.isAfter(thresholds.orphanNotAfter)) {
        return { action: 'skip', reason: 'plan-too-fresh' };
    }
    if (xoDate.isBefore(thresholds.orphanNotBefore)) {
        return { action: 'skip', reason: 'plan-too-old' };
    }
    if (hasXoWorkSincePlan) {
        return { action: 'skip', reason: 'work-exists' };
    }
    return { action: 'dispatch', reason: 'orphan-xo-date' };
}

/** Человекочитаемое пояснение вердикта — в warnings прогона и логи. */
export const XO_RESCUE_REASON_TEXT: Record<XoRescueReason, string> = {
    'marker-stuck': 'взят в очередь, но хук не доехал',
    'orphan-xo-date': 'звонок назначен, а работы по нему не появилось',
    'marker-fresh': 'взят в очередь только что — хук ещё обрабатывается',
    delivered: 'хук уже доставлен',
    'no-plan-date': 'дата ХО не заполнена',
    'plan-ahead': 'дата ХО в будущем — звонок ещё не наступил',
    'plan-too-fresh': 'дата ХО только наступила — даём хуку доработать',
    'plan-too-old': 'дата ХО слишком старая — это история, а не упавший хук',
    'work-exists': 'работа по клиенту уже есть',
};
