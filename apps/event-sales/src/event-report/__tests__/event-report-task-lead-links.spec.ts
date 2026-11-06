import { BitrixDateTime, ETimeZone } from '@/shared/lib/date';
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
        planDeadline: BitrixDateTime.fromPortalInput(
            '2026-08-15T10:00:00',
            ETimeZone.EUROPE_MOSCOW,
        ),
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

    it('внеплановая презентация в задачу не попадает, запланированная — да (как legacy)', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new EventReportTaskFlowService(
            bitrix as never,
            makePortal() as never,
        );

        service.queue(baseCtx(), {
            baseDealId: '600',
            newPlanPresDealId: '$result[set_plan_pres_deal]',
            newUnplannedPresDealId: '$result[set_unplanned_pres_deal]',
        });

        const add = calls.find(c => c.method === 'task.add');
        const links = (add?.args[0] as Record<string, unknown>)
            .UF_CRM_TASK as string[];
        expect(links).toEqual([
            'D_500',
            'D_600',
            'D_$result[set_plan_pres_deal]',
        ]);
    });

    /*
     * garant 30.10.2026: доработка из закрытой #28477 ушла в новую #110153,
     * а задача ссылалась на обе — две «основные» сделки путали менеджера.
     */
    it('сделка запуска осталась закрытой — задача ссылается только на новую', () => {
        const { bitrix, calls } = makeBitrix();
        const service = new EventReportTaskFlowService(
            bitrix as never,
            makePortal() as never,
        );

        service.queue(
            baseCtx({
                entityId: 28477,
                ownerDeal: { ID: '28477' },
                closedLaunchBaseDeal: { ID: '28477' },
            }),
            { ...deals, baseDealId: '$result[set_base_deal]' },
        );

        const add = calls.find(c => c.method === 'task.add');
        const links = (add?.args[0] as Record<string, unknown>)
            .UF_CRM_TASK as string[];
        expect(links).toContain('D_$result[set_base_deal]');
        expect(links).not.toContain('D_28477');
    });
});

/*
 * garant 06.11.2026, сделка 33467: лид 215557 удалили 08.10, сделка
 * продолжала на него ссылаться. Задача с удалённым лидом в UF_CRM_TASK
 * создаётся, но Битрикс не заводит для неё дело — в карточке сделки задачи
 * нет, а приложение при открытии падало на загрузке лида.
 */
describe('EventReportTaskFlowService — удалённые лиды в привязках', () => {
    const makeBitrixWithLeads = (
        alive: number[],
        options: { fail?: boolean } = {},
    ) => {
        const base = makeBitrix();
        const listCalls: unknown[] = [];
        const bitrix = {
            ...base.bitrix,
            lead: {
                getList: (filter: unknown) => {
                    listCalls.push(filter);
                    if (options.fail) {
                        return Promise.reject(new Error('socket hang up'));
                    }
                    const asked = (filter as { ID: number[] }).ID;
                    return Promise.resolve({
                        result: asked
                            .filter(id => alive.includes(id))
                            .map(id => ({ ID: String(id) })),
                    });
                },
            },
        };
        return { bitrix, calls: base.calls, listCalls };
    };

    const linksOf = (calls: { method: string; args: unknown[] }[]) =>
        (
            calls.find(c => c.method === 'task.add')?.args[0] as Record<
                string,
                unknown
            >
        ).UF_CRM_TASK as string[];

    const ownerWithLeads = () =>
        baseCtx({
            ownerDeal: {
                ID: '33467',
                LEAD_ID: '215557',
                UF_CRM_DEAL_JOINED_LEADS: ['L_11'],
            },
            entityId: 33467,
        });

    it('удалённый лид не попадает в новую задачу, живой остаётся', async () => {
        const { bitrix, calls, listCalls } = makeBitrixWithLeads([11]);
        const service = new EventReportTaskFlowService(
            bitrix as never,
            makePortal() as never,
        );
        const ctx = ownerWithLeads();

        await service.readMissingLeads(ctx);
        service.queue(ctx, deals);

        expect(listCalls).toHaveLength(1);
        expect(linksOf(calls)).toEqual(['L_11', 'D_33467']);
    });

    it('чтение лидов упало — привязки прежние, отчёт не падает', async () => {
        const { bitrix, calls } = makeBitrixWithLeads([], { fail: true });
        const service = new EventReportTaskFlowService(
            bitrix as never,
            makePortal() as never,
        );
        const ctx = ownerWithLeads();

        await expect(service.readMissingLeads(ctx)).resolves.toBeUndefined();
        service.queue(ctx, deals);

        expect(linksOf(calls)).toEqual(['L_215557', 'L_11', 'D_33467']);
    });

    it('без плана лиды не читаются — новой задачи не будет', async () => {
        const { bitrix, listCalls } = makeBitrixWithLeads([]);
        const service = new EventReportTaskFlowService(
            bitrix as never,
            makePortal() as never,
        );

        await service.readMissingLeads(
            baseCtx({
                isPlanned: false,
                ownerDeal: { ID: '1', LEAD_ID: '215557' },
            }),
        );

        expect(listCalls).toHaveLength(0);
    });

    it('лидов в окружении нет — портал не спрашиваем', async () => {
        const { bitrix, listCalls } = makeBitrixWithLeads([]);
        const service = new EventReportTaskFlowService(
            bitrix as never,
            makePortal() as never,
        );

        await service.readMissingLeads(baseCtx());

        expect(listCalls).toHaveLength(0);
    });
});
