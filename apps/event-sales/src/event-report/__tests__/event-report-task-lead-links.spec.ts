import { EventReportTaskFlowService } from '../services/task/event-report-task-flow.service';
import { DealFlowResult } from '../services/deal/event-report-deal-flow.service';

/**
 * Наследование лидов задачами: следующая задача не должна терять L_*
 * (требование «из лида должно быть видно, что происходит»).
 */
const makeBitrix = () => {
    const calls: { method: string; cmd: string; args: unknown[] }[] = [];
    const record =
        (method: string) =>
        (cmd: string, ...args: unknown[]) =>
            calls.push({ method, cmd, args });
    return {
        calls,
        bitrix: {
            batch: {
                task: {
                    add: record('task.add'),
                    update: record('task.update'),
                    complete: record('task.complete'),
                },
            },
        },
    };
};

const makePortal = () => ({
    getSalesTaskGroupId: () => 77,
    getEntityFieldByCode: (entity: string, code: string) =>
        entity === 'deal'
            ? { bitrixId: code.toUpperCase(), items: [] }
            : undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
});

const deals: DealFlowResult = {
    baseDealId: null,
    newPlanPresDealId: null,
    newUnplannedPresDealId: null,
};

const baseCtx = (over: Record<string, unknown> = {}) =>
    ({
        isExpired: false,
        isNew: false,
        isPlanned: true,
        isResult: true,
        entityType: 'deal',
        entityId: 500,
        planResponsibleId: 5,
        planCreatedById: 5,
        planDeadline: '2026-08-15T10:00:00',
        reportComment: '',
        planEventType: 'warm',
        currentTask: null,
        ownerDeal: null,
        dto: { plan: { type: { current: { name: 'Звонок' } } } },
        ...over,
    }) as never;

describe('EventReportTaskFlowService — наследование L_* в новой задаче', () => {
    it('L_* из текущей задачи переезжают в следующую', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new EventReportTaskFlowService(
            bitrix as never,
            makePortal() as never,
        );

        service.queue(
            baseCtx({
                currentTask: {
                    id: 900,
                    ufCrmTask: ['L_42', 'D_500', 'C_7'],
                },
            }),
            deals,
        );

        const add = calls.find(c => c.method === 'task.add');
        const links = (add?.args[0] as Record<string, unknown>)
            .UF_CRM_TASK as string[];
        expect(links).toContain('L_42');
        expect(links).toContain('D_500'); // владелец-сделка
    });

    it('лиды из полей сделки-владельца (deal_from_lead_id/joined/LEAD_ID) наследуются', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new EventReportTaskFlowService(
            bitrix as never,
            makePortal() as never,
        );

        service.queue(
            baseCtx({
                ownerDeal: {
                    ID: '500',
                    LEAD_ID: '42',
                    UF_CRM_DEAL_FROM_LEAD_ID: 'L_42',
                    UF_CRM_DEAL_JOINED_LEADS: ['L_42', 'L_11'],
                },
            }),
            deals,
        );

        const add = calls.find(c => c.method === 'task.add');
        const links = (add?.args[0] as Record<string, unknown>)
            .UF_CRM_TASK as string[];
        expect(links).toContain('L_42');
        expect(links).toContain('L_11');
        // Дедуп: L_42 встречается в трёх источниках, но в links — один раз.
        expect(links.filter(link => link === 'L_42')).toHaveLength(1);
    });

    it('без лидов в окружении состав ссылок прежний (регресс legacy-порядка)', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new EventReportTaskFlowService(
            bitrix as never,
            makePortal() as never,
        );

        service.queue(baseCtx(), deals);

        const add = calls.find(c => c.method === 'task.add');
        const links = (add?.args[0] as Record<string, unknown>)
            .UF_CRM_TASK as string[];
        expect(links).toEqual(['D_500']);
    });
});
