import { LeadClosingDecision } from '../lead-closing.decision';
import { LeadClosingCase } from '../lead-closing.reader';
import { LeadClosingTask, LeadClosingWork } from '../lead-closing-work.reader';
import { planLeadClosingWork } from '../lead-closing-work.plan';

const kase = (
    leadId: number,
    decision: LeadClosingDecision,
    linkDealAssignedId = 7,
): LeadClosingCase => ({
    lead: {
        id: leadId,
        statusId: 'PBX_TAKEN_IN_WORK',
        companyId: 0,
        contactId: 0,
        dealId: 10,
    },
    input: {
        deal: { id: 10, stage: 'sales_warm' },
        liveBaseDealId: null,
        hasOpenWorkElsewhere: false,
    },
    decision,
    linkDealLeadId: 0,
    linkDealAssignedId,
    linkCompany: null,
});
const open = (leadId: number): LeadClosingCase =>
    kase(leadId, {
        target: 'lead_converted',
        linkDealId: 10,
        reason: 'deal_open',
    });
const failed = (leadId: number): LeadClosingCase =>
    kase(leadId, {
        target: 'lead_converted',
        linkDealId: 10,
        reason: 'deal_fail',
    });
const kept = (leadId: number): LeadClosingCase =>
    kase(leadId, { target: null, linkDealId: null, reason: 'deleted_no_live' });
const task = (
    id: number,
    bindings: string[],
    responsibleId = 7,
): LeadClosingTask => ({ id, title: `t${id}`, responsibleId, bindings });
const work = (
    tasks: LeadClosingTask[],
    activities: LeadClosingWork['activities'] = [],
): LeadClosingWork => ({ tasks, activities });

describe('planLeadClosingWork — задачи и дела закрываемого лида', () => {
    it('задача на лиде и сделке — снимаем лид, остальное не трогаем', () => {
        const { tasks } = planLeadClosingWork(
            [open(1)],
            work([task(100, ['L_1', 'D_10', 'CO_5', 'T426_9'])]),
        );
        expect(tasks[0]).toMatchObject({
            action: 'unbind',
            bindingsAfter: ['D_10', 'CO_5', 'T426_9'],
            dealId: null,
        });
    });

    it('только на лиде, работа живая — переносим в сделку связи', () => {
        const { tasks } = planLeadClosingWork(
            [open(1)],
            work([task(100, ['L_1', 'C_3'])]),
        );
        expect(tasks[0]).toMatchObject({
            action: 'move',
            bindingsAfter: ['C_3', 'D_10'],
            dealId: 10,
            dealAssignedId: 7,
        });
    });

    it('только на лиде, работа закончена (отказ) — закрываем вместе с лидом', () => {
        const { tasks } = planLeadClosingWork(
            [failed(1)],
            work([task(100, ['L_1'])]),
        );
        expect(tasks[0]).toMatchObject({
            action: 'close',
            bindingsAfter: ['L_1'],
        });
    });

    it('задача двух закрываемых лидов — снимаются оба одной правкой, журнал у первого', () => {
        const { tasks } = planLeadClosingWork(
            [open(1), open(2)],
            work([task(100, ['L_1', 'L_2', 'D_10'])]),
        );
        expect(tasks).toHaveLength(1);
        expect(tasks[0]).toMatchObject({
            leadIds: [1, 2],
            bindingsAfter: ['D_10'],
        });
    });

    it('лид, который не закрываем, остаётся в привязках; его задачи не трогаем', () => {
        const plan = planLeadClosingWork(
            [open(1), kept(2)],
            work([task(100, ['L_1', 'L_2', 'D_10']), task(200, ['L_2'])]),
        );
        expect(plan.tasks).toHaveLength(1);
        expect(plan.tasks[0].bindingsAfter).toEqual(['L_2', 'D_10']);
    });

    it('одна живая работа среди лидов задачи — переносим, а не закрываем', () => {
        const { tasks } = planLeadClosingWork(
            [failed(1), open(2)],
            work([task(100, ['L_1', 'L_2'])]),
        );
        expect(tasks[0]).toMatchObject({
            action: 'move',
            bindingsAfter: ['D_10'],
        });
    });

    it('дела: переносим только при живой работе; задачи и звонки не дела', () => {
        const plan = planLeadClosingWork(
            [open(1), failed(2)],
            work(
                [],
                [
                    {
                        id: 1,
                        leadId: 1,
                        providerId: 'CRM_TODO',
                        subject: 'дело',
                    },
                    {
                        id: 2,
                        leadId: 1,
                        providerId: 'CRM_TASKS_TASK',
                        subject: 'задача',
                    },
                    {
                        id: 3,
                        leadId: 1,
                        providerId: 'VOXIMPLANT_CALL',
                        subject: 'звонок',
                    },
                    {
                        id: 4,
                        leadId: 2,
                        providerId: 'CRM_TODO',
                        subject: 'дело по отказу',
                    },
                ],
            ),
        );
        expect(plan.activities).toEqual([
            {
                activityId: 1,
                leadId: 1,
                dealId: 10,
                providerId: 'CRM_TODO',
                subject: 'дело',
            },
        ]);
    });
});
