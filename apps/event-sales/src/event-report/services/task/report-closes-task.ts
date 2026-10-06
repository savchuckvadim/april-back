import { EventSalesFlowDto } from '../../dto/event-sale-flow/event-sales-flow.dto';
import {
    EnumEventItemResultType,
    EnumWorkStatusCode,
} from '../../types/report-types';

/**
 * Признаки отчёта, от которых зависит судьба дела, по которому он отправлен.
 *
 * Правило одно на двоих: поток задач по нему закрывает дело (признаки берёт
 * из контекста отчёта), а гард повторной отправки по нему понимает, что
 * второй такой отчёт — дубль (признаки считает из присланного отчёта, теми
 * же формулами, что у контекста). Разъедутся — гард начнёт пропускать дубли
 * или отвергать законные отчёты.
 */
export interface ReportTaskFlags {
    /** Перенос: событие не состоялось, работа не окончена, следующее запланировано. */
    isMove: boolean;
    /** Новое событие — дела нет. */
    isNew: boolean;
    /** Звонок не состоялся. */
    isNoResult: boolean;
    /** Быстрый «Недозвон» из списка дел. */
    isNoCall: boolean;
    /** Работа окончена: продажа или отказ (в том числе «не ЦА»). */
    isFinal: boolean;
}

/**
 * Закрывает ли отчёт дело.
 *
 * Не закрывают: перенос (срок двигается), новое событие, нерезультативный
 * звонок и быстрый «Недозвон» без финала — это попытка, а не итог: клиент
 * не должен остаться без дела.
 */
export const reportClosesTask = (flags: ReportTaskFlags): boolean => {
    if (flags.isMove || flags.isNew) return false;
    if (flags.isNoResult && !flags.isFinal) return false;
    if (flags.isNoCall && !flags.isFinal) return false;
    return true;
};

/** Работа с клиентом окончена: продажа или отказ. */
export const isFinalWorkStatus = (
    code: EnumWorkStatusCode | null | undefined,
): boolean =>
    code === EnumWorkStatusCode.fail || code === EnumWorkStatusCode.success;

/**
 * Признаки из присланного отчёта — те же формулы, что у EventReportContext
 * (`isExpired`, `isNew`, `isNoResult`, `isNoCall`, `isFail`/`isSuccessSale`).
 */
export const reportTaskFlagsOf = (dto: EventSalesFlowDto): ReportTaskFlags => {
    const resultStatus = dto.report?.resultStatus ?? null;
    const isFinal = isFinalWorkStatus(dto.report?.workStatus?.current?.code);
    const isResult = resultStatus === EnumEventItemResultType.RESULT;
    const isNew = resultStatus === EnumEventItemResultType.NEW;
    return {
        isMove: !isResult && !isNew && !isFinal && Boolean(dto.plan?.isActive),
        isNew,
        isNoResult: resultStatus === EnumEventItemResultType.NORESULT,
        isNoCall: Boolean(dto.report?.isNoCall),
        isFinal,
    };
};
