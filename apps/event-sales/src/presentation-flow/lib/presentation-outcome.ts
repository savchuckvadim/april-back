import {
    PRESENTATION_RESULT_CODE,
    PresentationResultCode,
    PresentationSmartStageCode,
} from '@lib/portal-lib/pbx/pbx-presentation-smart';
import { EVENT_REPORT_ACTION } from '../../event-report/types/event-report.event-codes';

/**
 * Исход отчёта по презентации — тот же алфавит действий, которым двигается
 * сделка воронки sales_presentation (PRESENTATION_EVENT_ACTIONS минус
 * `plan`). Общий алфавит важен: элемент смарта обязан оказаться в стадии,
 * зеркальной стадии pres-сделки того же отчёта.
 */
export const PRESENTATION_OUTCOME = {
    done: EVENT_REPORT_ACTION.done,
    success: EVENT_REPORT_ACTION.success,
    expired: EVENT_REPORT_ACTION.expired,
    fail: EVENT_REPORT_ACTION.fail,
    noresult: EVENT_REPORT_ACTION.noresult,
} as const;

export type PresentationOutcome =
    (typeof PRESENTATION_OUTCOME)[keyof typeof PRESENTATION_OUTCOME];

/** Флаги отчёта, от которых зависит исход (подмножество EventReportContext). */
export interface PresentationOutcomeFlags {
    /** Финал «Продажа». */
    isSuccessSale: boolean;
    /** Финал «Отказ». */
    isFail: boolean;
    /** Перенос: отчитались не результатом, план не выключили. */
    isExpired: boolean;
    /** Разговор/встреча состоялись. */
    isResult: boolean;
}

/**
 * Исход отчёта по флагам — копия порядка проверок
 * `SalesPresentationDealService.deriveReportAction`: продажа → отказ →
 * перенос → «не состоялась» → «проведена». Порядок важен: финал важнее
 * переноса, иначе отказ уехал бы в «Перенос» и презентация осталась бы
 * висеть открытой.
 */
export function derivePresentationOutcome(
    flags: PresentationOutcomeFlags,
): PresentationOutcome {
    if (flags.isSuccessSale) return PRESENTATION_OUTCOME.success;
    if (flags.isFail) return PRESENTATION_OUTCOME.fail;
    if (flags.isExpired) return PRESENTATION_OUTCOME.expired;
    if (!flags.isResult) return PRESENTATION_OUTCOME.noresult;
    return PRESENTATION_OUTCOME.done;
}

/**
 * Исход → стадия элемента смарта (зеркало getPresentationTargetStageCode).
 * `isResult` разводит отказ: встреча состоялась и клиент отказался —
 * «Отказ после презентации», встречи не было — «Не состоялась».
 */
export function presentationStageForOutcome(
    outcome: PresentationOutcome,
    isResult: boolean,
): PresentationSmartStageCode {
    switch (outcome) {
        case PRESENTATION_OUTCOME.done:
        case PRESENTATION_OUTCOME.success:
            return 'pres_success';
        case PRESENTATION_OUTCOME.expired:
            // Перенос — ОТКРЫТАЯ стадия: презентация ещё состоится.
            return 'pres_pending';
        case PRESENTATION_OUTCOME.fail:
            return isResult ? 'pres_fail' : 'pres_noresult';
        case PRESENTATION_OUTCOME.noresult:
        default:
            return 'pres_noresult';
    }
}

/** Исход → код значения поля «Результат» (enum смарта). */
export function presentationResultCode(
    outcome: PresentationOutcome,
    isResult: boolean,
): PresentationResultCode {
    switch (outcome) {
        case PRESENTATION_OUTCOME.done:
        case PRESENTATION_OUTCOME.success:
            return PRESENTATION_RESULT_CODE.done;
        case PRESENTATION_OUTCOME.expired:
            return PRESENTATION_RESULT_CODE.moved;
        case PRESENTATION_OUTCOME.fail:
            return isResult
                ? PRESENTATION_RESULT_CODE.fail
                : PRESENTATION_RESULT_CODE.noresult;
        case PRESENTATION_OUTCOME.noresult:
        default:
            return PRESENTATION_RESULT_CODE.noresult;
    }
}

/** Перенос оставляет элемент живым — единственный «незакрывающий» исход. */
export function isPresentationMoveOutcome(
    outcome: PresentationOutcome,
): boolean {
    return outcome === PRESENTATION_OUTCOME.expired;
}
