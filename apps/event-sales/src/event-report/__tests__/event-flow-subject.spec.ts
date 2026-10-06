import { EventSalesFlowDto } from '../dto/event-sale-flow/event-sales-flow.dto';
import { EnumEventFlowStatus } from '../dto/response/event-flow-operation.dto';
import {
    EnumEventItemResultType,
    EnumWorkStatusCode,
} from '../types/report-types';
import {
    EVENT_FLOW_SUBJECT_KIND,
    duplicateReportMessage,
    eventFlowSubjectOf,
} from '../services/flow-guard/event-flow-subject';

const dto = (over: {
    taskId?: number;
    resultStatus?: EnumEventItemResultType | null;
    workStatus?: EnumWorkStatusCode;
    planActive?: boolean;
    isNoCall?: boolean;
    context?: { companyId?: number; dealId?: number; leadId?: number };
}): EventSalesFlowDto =>
    ({
        domain: 'garant.bitrix24.ru',
        currentTask: over.taskId ? { id: over.taskId } : undefined,
        report: {
            resultStatus:
                over.resultStatus === undefined
                    ? EnumEventItemResultType.RESULT
                    : over.resultStatus,
            workStatus: {
                current: { code: over.workStatus ?? EnumWorkStatusCode.fail },
            },
            isNoCall: Boolean(over.isNoCall),
        },
        plan: { isActive: Boolean(over.planActive) },
        context: over.context ?? { dealId: 27537 },
    }) as unknown as EventSalesFlowDto;

describe('eventFlowSubjectOf: по чему второй отчёт — дубль', () => {
    it('отчёт, закрывающий дело, — предмет «дело» (случай сделки 27537)', () => {
        expect(eventFlowSubjectOf(dto({ taskId: 769671 }))).toEqual({
            kind: EVENT_FLOW_SUBJECT_KIND.task,
            key: 'task:769671',
        });
    });

    it('перенос и недозвон по делу предмета не имеют: их бывает несколько подряд', () => {
        expect(
            eventFlowSubjectOf(
                dto({
                    taskId: 1,
                    resultStatus: EnumEventItemResultType.NORESULT,
                    workStatus: EnumWorkStatusCode.inJob,
                    planActive: true,
                }),
            ),
        ).toBeNull();
        expect(
            eventFlowSubjectOf(
                dto({
                    taskId: 1,
                    resultStatus: null,
                    workStatus: EnumWorkStatusCode.inJob,
                    isNoCall: true,
                }),
            ),
        ).toBeNull();
    });

    it('итог без дела — предмет «итог по сделке» с самим итогом', () => {
        expect(
            eventFlowSubjectOf(
                dto({
                    resultStatus: EnumEventItemResultType.NEW,
                    context: { companyId: 5, dealId: 27537 },
                }),
            ),
        ).toEqual({
            kind: EVENT_FLOW_SUBJECT_KIND.outcome,
            key: 'outcome:deal:27537:fail',
            outcome: EnumWorkStatusCode.fail,
        });
    });

    it('без сделки итог привязан к компании, без компании — к лиду', () => {
        expect(
            eventFlowSubjectOf(
                dto({
                    resultStatus: EnumEventItemResultType.NEW,
                    workStatus: EnumWorkStatusCode.success,
                    context: { companyId: 5 },
                }),
            )?.key,
        ).toBe('outcome:company:5:success');
        expect(
            eventFlowSubjectOf(
                dto({
                    resultStatus: EnumEventItemResultType.NEW,
                    context: { leadId: 9 },
                }),
            )?.key,
        ).toBe('outcome:lead:9:fail');
    });

    it('новое событие «в работе» предмета не имеет', () => {
        expect(
            eventFlowSubjectOf(
                dto({
                    resultStatus: EnumEventItemResultType.NEW,
                    workStatus: EnumWorkStatusCode.inJob,
                    planActive: true,
                }),
            ),
        ).toBeNull();
    });
});

describe('duplicateReportMessage: что увидит менеджер', () => {
    const now = new Date('2026-10-06T11:54:00.000Z');
    const task = { kind: EVENT_FLOW_SUBJECT_KIND.task, key: 'task:1' };

    it('первый отчёт ещё идёт — просим дождаться', () => {
        expect(
            duplicateReportMessage(
                task,
                {
                    status: EnumEventFlowStatus.RUNNING,
                    queuedAt: '2026-10-06T11:53:30.000Z',
                    finishedAt: null,
                },
                now,
            ),
        ).toBe(
            'Отчёт по этому делу уже отправляется — дождитесь, список ' +
                'обновится сам. Второй не записан',
        );
    });

    it('первый выполнен — говорим, когда, и что второй не записан', () => {
        expect(
            duplicateReportMessage(
                task,
                {
                    status: EnumEventFlowStatus.DONE,
                    queuedAt: '2026-10-06T11:50:00.000Z',
                    finishedAt: '2026-10-06T11:51:07.000Z',
                },
                now,
            ),
        ).toBe(
            'Отчёт по этому делу уже принят 2 мин назад. Второй не ' +
                'записан — обновите список событий',
        );
    });

    it('итог по клиенту называется по-русски', () => {
        expect(
            duplicateReportMessage(
                {
                    kind: EVENT_FLOW_SUBJECT_KIND.outcome,
                    key: 'outcome:deal:1:fail',
                    outcome: EnumWorkStatusCode.fail,
                },
                {
                    status: EnumEventFlowStatus.DONE,
                    queuedAt: '2026-10-06T11:53:40.000Z',
                    finishedAt: '2026-10-06T11:53:50.000Z',
                },
                now,
            ),
        ).toBe(
            '«Отказ» по этому клиенту уже записан только что. Второй раз ' +
                'не записываем',
        );
    });
});
