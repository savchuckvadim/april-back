import { PresentationFlowJobData } from '../../presentation-flow/dto/presentation-flow-job.dto';
import { EventReportContext } from '../../event-report/services/context/event-report.context';
import { EEventReportEntityType } from '../../event-report/services/init/event-report-init.types';
import { EVENT_REPORT_EVENT_TYPE } from '../../event-report/types/event-report.event-codes';

export interface TmcPresentationRequestJobInput {
    ctx: EventReportContext;
    /** Реальный id ТМЦ-сделки (из контекста или ответа батча); null — нет. */
    tmcDealId: number | null;
    /** id задачи ТМЦ-менеджера, созданной этим отчётом (из ответа батча). */
    planTaskId: number | null;
    socketId?: string;
}

/**
 * Джоб сайд-очереди презентаций для ЗАЯВКИ ТМЦ (`kind: 'request'`).
 *
 * Элемент смарта рождается в «Заявка на презентацию» и ждёт согласования;
 * план презентации менеджера ОП после утверждения продвинет его по той же
 * ТМЦ-сделке. Основной сделки ОП у заявки нет по определению, презентации
 * тоже — поля отчёта пусты. Кто «проводит» — ТМЦ-менеджер (он ведёт заявку
 * до утверждения), кто «назначил» — постановщик плана (руководитель ТМЦ,
 * сам менеджер — если планировал себе).
 *
 * null — план не презентация: заявки нет.
 */
export function buildTmcPresentationRequestJob(
    input: TmcPresentationRequestJobInput,
): PresentationFlowJobData | null {
    const { ctx } = input;
    if (
        !ctx.isPlanned ||
        ctx.planEventType !== EVENT_REPORT_EVENT_TYPE.presentation
    ) {
        return null;
    }
    const companyId =
        ctx.entityType === EEventReportEntityType.COMPANY
            ? ctx.entityId
            : Number(ctx.company?.ID) || null;
    const ownerId = ctx.planCreatedById || null;

    return {
        domain: ctx.domain,
        operationId: ctx.dto.operationId,
        socketId: input.socketId,
        kind: 'request',
        outcome: null,
        isResult: ctx.isResult,
        isSpontaneous: false,
        taskId: null,
        planTaskId: input.planTaskId,
        baseDealId: null,
        presDealId: null,
        tmcDealId: input.tmcDealId,
        companyId,
        leadId: Number(ctx.lead?.ID) || null,
        contactId:
            Number(ctx.dto.plan?.contact?.ID ?? ctx.dto.report?.contact?.ID) ||
            null,
        responsibleId: ctx.planResponsibleId,
        planResponsibleId: ctx.planCreatedById || ctx.planResponsibleId,
        planDeadline: ctx.planDeadline?.toCrmDateTime() ?? null,
        planName: ctx.planEventName || null,
        planComment: ctx.reportComment || null,
        reportComment: null,
        failReasonCode: null,
        survey: {},
        tmcResponsibleId: ctx.planResponsibleId,
        ownerId,
        requestComment: ctx.reportComment || null,
    };
}
