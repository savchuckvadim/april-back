import {
    mergeTaskCrmBindings,
    taskCrmBinding,
} from '@/modules/bitrix/domain/tasks/task/lib/task-crm-binding.util';
import { IBatchGroupBuffer } from '../../../../shared/batch/batch-group-buffer.interface';
import { ResolvedLeadToWorkItem } from '../../dto/lead-to-work.dto';
import { LeadToWorkContext } from '../lead-to-work-context.service';
import {
    BxRow,
    CALL_TASK_PREFIX,
    LeadToWorkFlowBase,
} from './lead-to-work-flow.base';

/** Ограничение на задачи в группе — запас до лимита батча 50. */
const MAX_TASKS_IN_GROUP = 30;

/** Итог работы с задачами лида. */
export interface TaskFlowResult {
    tasksMoved: number;
    tasksClosed: number;
    /** Ключ команды создания новой задачи (если создавали). */
    addCmd?: string;
    warnings: string[];
}

/** Что нужно задачам от уже поставленных команд. */
export interface TaskFlowInput {
    /** Название события (для заголовка новой задачи). */
    eventName: string;
    /** Готовое название ХО-задачи («Холодный обзвон. Заявка. …»). */
    xoTitle: string;
    companyRef: string | null;
    dealRef: string;
    xoRef: string | null;
}

/**
 * Задачи хука «лид → работа».
 *
 * Два режима: `move` — открытые задачи переезжают на нового ответственного
 * с идемпотентным префиксом «Звонок» (повторный хук не даёт «Звонок Звонок…»)
 * и union CRM-привязок; `close` (а также любая ХО-ветка) — открытые задачи
 * закрываются и ставится одна новая. Новая задача создаётся и тогда, когда
 * открытых задач не было вовсе — иначе клиент остался бы без следующего шага.
 */
export class TaskFlowService extends LeadToWorkFlowBase {
    queue(
        item: ResolvedLeadToWorkItem,
        ctx: LeadToWorkContext,
        input: TaskFlowInput,
        buffer: IBatchGroupBuffer,
    ): TaskFlowResult {
        const result: TaskFlowResult = {
            tasksMoved: 0,
            tasksClosed: 0,
            warnings: [],
        };
        const groupId = this.portal.getSalesTaskGroupId();
        const bindings = this.taskBindings(item.leadId, input);
        const closeAll = item.taskMode === 'close' || item.isXo === 'Y';

        let tasks = ctx.openTasks;
        if (tasks.length > MAX_TASKS_IN_GROUP) {
            result.warnings.push(
                `Открытых задач ${tasks.length} — обработаны первые ${MAX_TASKS_IN_GROUP} (лимит batch-группы)`,
            );
            tasks = tasks.slice(0, MAX_TASKS_IN_GROUP);
        }

        for (const task of tasks) {
            const row = task as unknown as BxRow;
            const taskId = Number(row.id ?? row.ID);
            if (!Number.isFinite(taskId)) continue;

            if (closeAll) {
                buffer.queue(() =>
                    this.bitrix.batch.task.complete(
                        `lw_task_close_${taskId}`,
                        taskId,
                    ),
                );
                result.tasksClosed += 1;
                continue;
            }

            const rawTitle = this.text(row.title) ?? this.text(row.TITLE) ?? '';
            const currentBindings = this.refList(
                row.ufCrmTask ?? row.UF_CRM_TASK,
            );
            buffer.queue(() =>
                this.bitrix.batch.task.update(
                    `lw_task_move_${taskId}`,
                    taskId,
                    {
                        TITLE: this.withPrefix(rawTitle, CALL_TASK_PREFIX),
                        RESPONSIBLE_ID: item.responsible,
                        ...(groupId ? { GROUP_ID: groupId } : {}),
                        UF_CRM_TASK: mergeTaskCrmBindings(
                            currentBindings,
                            bindings,
                        ),
                    } as never,
                ),
            );
            result.tasksMoved += 1;
        }

        // Новая задача: при close-режиме всегда; при move — если задач не было.
        const needNewTask = closeAll || ctx.openTasks.length === 0;
        if (!needNewTask) return result;

        const title =
            item.isXo === 'Y'
                ? input.xoTitle
                : `${CALL_TASK_PREFIX} ${input.eventName}`;
        const cmd = `lw_task_add_${item.leadId}`;
        const payload: BxRow = {
            TITLE: title,
            RESPONSIBLE_ID: item.responsible,
            UF_CRM_TASK: bindings,
            ...(groupId ? { GROUP_ID: groupId } : {}),
        };
        const deadline = this.parseDeadline(item.deadline);
        if (deadline) payload.DEADLINE = deadline.toTaskDeadline();

        buffer.queue(() => this.bitrix.batch.task.add(cmd, payload as never));
        result.addCmd = cmd;
        return result;
    }

    /* ------------------------------------------------------------------ */

    private taskBindings(leadId: number, input: TaskFlowInput): string[] {
        const bindings = [
            taskCrmBinding('LEAD', leadId),
            taskCrmBinding('DEAL', input.dealRef),
        ];
        if (input.companyRef) {
            bindings.push(taskCrmBinding('COMPANY', input.companyRef));
        }
        if (input.xoRef) bindings.push(taskCrmBinding('DEAL', input.xoRef));
        return bindings;
    }

    /** Префикс один раз: повторный хук не даёт «Звонок Звонок …». */
    private withPrefix(title: string, prefix: string): string {
        return title.startsWith(prefix) ? title : `${prefix} ${title}`.trim();
    }
}
