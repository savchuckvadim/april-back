import { EventReportContext } from '../../event-report/services/context/event-report.context';
import { buildTmcPresentationRequestJob } from '../services/tmc-presentation-request-job.builder';

/**
 * Джоб заявки ТМЦ в очередь презентаций: kind `request`, ТМЦ-менеджер —
 * ответственный, постановщик плана — руководитель, задача ТМЦ из ответа
 * батча; основной сделки и презентации нет.
 */
const makeCtx = (over: Record<string, unknown> = {}): EventReportContext =>
    ({
        domain: 'gsr.bitrix24.ru',
        dto: {
            operationId: 'op-7',
            plan: { contact: { ID: 9 } },
            report: { contact: null },
        },
        isPlanned: true,
        planEventType: 'presentation',
        planEventName: 'Демо СПС',
        planCreatedById: 7,
        planResponsibleId: 251,
        planDeadline: { toCrmDateTime: () => '15.11.2026 14:30:00' },
        reportComment: 'Директор ждёт показ',
        isResult: true,
        entityType: 'company',
        entityId: 431,
        company: { ID: '431' },
        lead: null,
        ...over,
    }) as unknown as EventReportContext;

describe('buildTmcPresentationRequestJob', () => {
    it('собирает джоб заявки: роли, ТМЦ-сделка и задача из ответа батча, пустой отчёт', () => {
        const job = buildTmcPresentationRequestJob({
            ctx: makeCtx(),
            tmcDealId: 777,
            planTaskId: 555,
            socketId: 'sock-1',
        });

        expect(job).toEqual({
            domain: 'gsr.bitrix24.ru',
            operationId: 'op-7',
            socketId: 'sock-1',
            kind: 'request',
            outcome: null,
            isResult: true,
            isSpontaneous: false,
            taskId: null,
            planTaskId: 555,
            baseDealId: null,
            presDealId: null,
            tmcDealId: 777,
            companyId: 431,
            leadId: null,
            contactId: 9,
            responsibleId: 251,
            planResponsibleId: 7,
            planDeadline: '15.11.2026 14:30:00',
            planName: 'Демо СПС',
            planComment: 'Директор ждёт показ',
            reportComment: null,
            failReasonCode: null,
            survey: {},
            tmcResponsibleId: 251,
            ownerId: 7,
            requestComment: 'Директор ждёт показ',
        });
    });

    it('менеджер планировал себе — он же «назначил», руководителя нет', () => {
        const job = buildTmcPresentationRequestJob({
            ctx: makeCtx({ planCreatedById: 0, reportComment: '' }),
            tmcDealId: null,
            planTaskId: null,
        });

        expect(job?.planResponsibleId).toBe(251);
        expect(job?.ownerId).toBeNull();
        expect(job?.requestComment).toBeNull();
        expect(job?.tmcDealId).toBeNull();
    });

    it('план не презентация или выключен — заявки нет', () => {
        expect(
            buildTmcPresentationRequestJob({
                ctx: makeCtx({ planEventType: 'warm' }),
                tmcDealId: 777,
                planTaskId: 555,
            }),
        ).toBeNull();
        expect(
            buildTmcPresentationRequestJob({
                ctx: makeCtx({ isPlanned: false }),
                tmcDealId: 777,
                planTaskId: 555,
            }),
        ).toBeNull();
    });
});
