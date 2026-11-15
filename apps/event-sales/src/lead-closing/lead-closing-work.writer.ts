import { BitrixService } from '@/modules/bitrix';
import { BitrixOwnerTypeId } from '@lib/bitrix';
import {
    LeadClosingActivityMove,
    LeadClosingTaskAction,
    LeadClosingWorkPlan,
} from './lead-closing-work.plan';

/** Команды batch одного действия — по ним журнал отмечает, что прошло. */
export const taskCmd = (action: LeadClosingTaskAction): string =>
    `lc_task_${action.taskId}`;
export const approveCmd = (taskId: number): string => `lc_approve_${taskId}`;
export const activityCmds = (
    move: LeadClosingActivityMove,
): { add: string; del: string } => ({
    add: `lc_act_add_${move.activityId}`,
    del: `lc_act_del_${move.activityId}`,
});

/**
 * Ставит в batch действия с задачами и делами закрываемых лидов — ДО смены
 * статуса лида (отправляет вызывающий, отдельной пачкой: лид с упавшей
 * командой по задаче не закрывается). Откат — по журналу: привязки задач
 * возвращаются, закрытые задачи возобновляются, дела — обратно на лид.
 *
 * НЕ @Injectable: создаётся `new` с инстансом Битрикса конкретного портала.
 */
export class LeadClosingWorkWriter {
    constructor(private readonly bitrix: BitrixService) {}

    queue(plan: LeadClosingWorkPlan): number {
        for (const action of plan.tasks) this.queueTask(action, false);
        for (const move of plan.activities) this.queueActivity(move, false);
        return plan.tasks.length + plan.activities.length * 2;
    }

    /**
     * Принять работу за постановщика (решение владельца 14.11.2026): закрытые
     * задачи с контролем стоят в «Ждёт контроля», approve их завершает.
     * Откат не нужен отдельно — renew возобновляет и из «Завершена».
     */
    queueApprove(taskIds: number[]): void {
        for (const taskId of taskIds) {
            this.bitrix.batch.task.approve(approveCmd(taskId), taskId);
        }
    }

    queueRollback(plan: LeadClosingWorkPlan): void {
        for (const action of plan.tasks) this.queueTask(action, true);
        for (const move of plan.activities) this.queueActivity(move, true);
    }

    private queueTask(action: LeadClosingTaskAction, rollback: boolean): void {
        const cmd = `${taskCmd(action)}${rollback ? '_rb' : ''}`;
        if (action.action === 'close') {
            if (rollback) this.bitrix.batch.task.renew(cmd, action.taskId);
            else this.bitrix.batch.task.complete(cmd, action.taskId);
            return;
        }
        this.bitrix.batch.task.update(cmd, action.taskId, {
            UF_CRM_TASK: rollback
                ? action.bindingsBefore
                : action.bindingsAfter,
        });
    }

    /** Сначала новая привязка, потом снятие старой — дело не остаётся ничьим. */
    private queueActivity(
        move: LeadClosingActivityMove,
        rollback: boolean,
    ): void {
        const { add, del } = activityCmds(move);
        const suffix = rollback ? '_rb' : '';
        const lead = { type: BitrixOwnerTypeId.LEAD, id: move.leadId };
        const deal = { type: BitrixOwnerTypeId.DEAL, id: move.dealId };
        const [to, from] = rollback ? [lead, deal] : [deal, lead];
        this.bitrix.batch.activity.addBinding(
            `${add}${suffix}`,
            move.activityId,
            to.type,
            to.id,
        );
        this.bitrix.batch.activity.deleteBinding(
            `${del}${suffix}`,
            move.activityId,
            from.type,
            from.id,
        );
    }
}
