import {
    callActor,
    callEntity,
    CallContextAnnotation,
    CallEntity,
} from '@lib/core/call-context';
import {
    EEvFlowFrom,
    EvFlowContextDto,
} from '../dto/event-sale-flow/flow-context.dto';
import { EventSalesFlowDto } from '../dto/event-sale-flow/event-sales-flow.dto';
import { isTmcReport } from '../../event-report-tmc/lib/is-tmc-report';

/** Операции отчёта — для подписи тревог и журнала сбоев Битрикса. */
export const EVENT_REPORT_OPERATION = {
    calls: 'Отчёт «Звонки»',
    tmc: 'Отчёт ТМЦ',
    deferred: 'Досылка отчёта',
    tmcApproval: 'Отчёт ТМЦ: согласование презентации',
} as const;

/** Карточка, из которой открыт отчёт; не указана — владелец события. */
const fromPlacement = (context: EvFlowContextDto): CallEntity | undefined => {
    switch (context.from) {
        case EEvFlowFrom.DEAL:
            return callEntity('deal', context.dealId);
        case EEvFlowFrom.COMPANY:
            return callEntity('company', context.companyId);
        case EEvFlowFrom.LEAD:
            return callEntity('lead', context.leadId);
        case EEvFlowFrom.TASK:
            return callEntity('task', context.taskId);
        default:
            return undefined;
    }
};

/** Владелец события в приоритете DTO: компания → сделка → лид. */
const reportEntity = (context?: EvFlowContextDto): CallEntity | undefined =>
    context
        ? (fromPlacement(context) ??
          callEntity('company', context.companyId) ??
          callEntity('deal', context.dealId) ??
          callEntity('lead', context.leadId))
        : undefined;

/**
 * Что пишет отчёт: операция, портал, карточка и сотрудник (за кем
 * числится отчёт — `plan.responsibility`, и в режиме руководителя тоже).
 */
export function eventReportCallContext(
    dto: Pick<EventSalesFlowDto, 'domain' | 'context' | 'plan' | 'departament'>,
    operation?: string,
): CallContextAnnotation {
    return {
        operation:
            operation ??
            (isTmcReport(dto)
                ? EVENT_REPORT_OPERATION.tmc
                : EVENT_REPORT_OPERATION.calls),
        domain: dto.domain,
        entity: reportEntity(dto.context),
        actor: callActor(dto.plan?.responsibility?.ID),
    };
}
