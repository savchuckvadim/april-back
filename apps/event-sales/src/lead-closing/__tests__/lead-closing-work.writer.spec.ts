import { BitrixService } from '@/modules/bitrix';
import { BitrixOwnerTypeId } from '@lib/bitrix';
import { LeadClosingWorkPlan } from '../lead-closing-work.plan';
import { LeadClosingWorkWriter } from '../lead-closing-work.writer';

const setup = () => {
    const calls: string[] = [];
    const log = (name: string) =>
        jest.fn((...args: unknown[]) =>
            calls.push(`${name} ${JSON.stringify(args)}`),
        );
    const bitrix = {
        batch: {
            task: {
                update: log('task.update'),
                complete: log('task.complete'),
                renew: log('task.renew'),
                approve: log('task.approve'),
            },
            activity: {
                addBinding: log('act.add'),
                deleteBinding: log('act.del'),
            },
        },
    } as unknown as BitrixService;
    return { writer: new LeadClosingWorkWriter(bitrix), calls };
};

const base = { title: 't', leadIds: [1], responsibleId: 7, dealAssignedId: 7 };
const plan: LeadClosingWorkPlan = {
    tasks: [
        {
            ...base,
            taskId: 100,
            action: 'unbind',
            bindingsBefore: ['L_1', 'D_10'],
            bindingsAfter: ['D_10'],
            dealId: null,
        },
        {
            ...base,
            taskId: 200,
            action: 'move',
            bindingsBefore: ['L_1'],
            bindingsAfter: ['D_10'],
            dealId: 10,
        },
        {
            ...base,
            taskId: 300,
            action: 'close',
            bindingsBefore: ['L_1'],
            bindingsAfter: ['L_1'],
            dealId: null,
        },
    ],
    activities: [
        {
            activityId: 50,
            leadId: 1,
            dealId: 10,
            providerId: 'CRM_TODO',
            subject: 'дело',
        },
    ],
};

describe('LeadClosingWorkWriter', () => {
    it('задачи: правка привязок или закрытие; дело: сначала сделка, потом снятие лида', () => {
        const { writer, calls } = setup();
        expect(writer.queue(plan)).toBe(5);
        expect(calls).toEqual([
            `task.update ${JSON.stringify(['lc_task_100', 100, { UF_CRM_TASK: ['D_10'] }])}`,
            `task.update ${JSON.stringify(['lc_task_200', 200, { UF_CRM_TASK: ['D_10'] }])}`,
            `task.complete ${JSON.stringify(['lc_task_300', 300])}`,
            `act.add ${JSON.stringify(['lc_act_add_50', 50, BitrixOwnerTypeId.DEAL, 10])}`,
            `act.del ${JSON.stringify(['lc_act_del_50', 50, BitrixOwnerTypeId.LEAD, 1])}`,
        ]);
    });

    it('откат: прежние привязки, закрытая — возобновляется, дело — обратно на лид', () => {
        const { writer, calls } = setup();
        writer.queueRollback(plan);
        expect(calls).toEqual([
            `task.update ${JSON.stringify(['lc_task_100_rb', 100, { UF_CRM_TASK: ['L_1', 'D_10'] }])}`,
            `task.update ${JSON.stringify(['lc_task_200_rb', 200, { UF_CRM_TASK: ['L_1'] }])}`,
            `task.renew ${JSON.stringify(['lc_task_300_rb', 300])}`,
            `act.add ${JSON.stringify(['lc_act_add_50_rb', 50, BitrixOwnerTypeId.LEAD, 1])}`,
            `act.del ${JSON.stringify(['lc_act_del_50_rb', 50, BitrixOwnerTypeId.DEAL, 10])}`,
        ]);
    });
    it('принять за постановщика — approve по каждой задаче «Ждёт контроля»', () => {
        const { writer, calls } = setup();
        writer.queueApprove([300, 301]);
        expect(calls).toEqual([
            `task.approve ${JSON.stringify(['lc_approve_300', 300])}`,
            `task.approve ${JSON.stringify(['lc_approve_301', 301])}`,
        ]);
    });
});
