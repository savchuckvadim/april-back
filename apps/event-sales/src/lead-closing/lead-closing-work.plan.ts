import { isLinkDealLive } from './lead-closing.decision';
import { LeadClosingCase } from './lead-closing.reader';
import { LeadClosingWork } from './lead-closing-work.reader';

/**
 * Что делать с открытой задачей закрываемого лида (решения владельца
 * 13–14.11.2026):
 * - unbind — у задачи есть сделка в привязках: снимаем лид, задача остаётся
 *   в сделке;
 * - move — сделки нет, а сделка-работа лида живая: привязываем к ней и
 *   снимаем лид;
 * - close — сделки нет, а работа закончена (отказ, не состоялась, не ЦА,
 *   дубль без живой сделки): задача закрывается вместе с лидом.
 */
export const LEAD_CLOSING_TASK_ACTIONS = ['unbind', 'move', 'close'] as const;
export type LeadClosingTaskActionKind =
    (typeof LEAD_CLOSING_TASK_ACTIONS)[number];

export interface LeadClosingTaskAction {
    taskId: number;
    action: LeadClosingTaskActionKind;
    title: string;
    /** Закрываемые лиды в привязках задачи (журнал — у первого). */
    leadIds: number[];
    bindingsBefore: string[];
    bindingsAfter: string[];
    /** Сделка, куда переносится задача (move). */
    dealId: number | null;
    responsibleId: number;
    /** Ответственный сделки переноса — для выгрузки несовпадений. */
    dealAssignedId: number;
}

/** Дело с владельцем-лидом, которое переносится в живую сделку-работу. */
export interface LeadClosingActivityMove {
    activityId: number;
    leadId: number;
    dealId: number;
    providerId: string;
    subject: string;
}

export interface LeadClosingWorkPlan {
    tasks: LeadClosingTaskAction[];
    activities: LeadClosingActivityMove[];
}

/** Дела задач идут вместе с задачами, записи звонков не трогаем. */
const SKIPPED_PROVIDERS: ReadonlySet<string> = new Set([
    'CRM_TASKS_TASK',
    'VOXIMPLANT_CALL',
]);

const leadOf = (binding: string): number =>
    /^L_(\d+)$/.test(binding) ? Number(binding.slice(2)) : 0;

export function planLeadClosingWork(
    cases: LeadClosingCase[],
    work: LeadClosingWork,
): LeadClosingWorkPlan {
    const closing = new Map(
        cases
            .filter(item => item.decision.target !== null)
            .map(item => [item.lead.id, item]),
    );
    const liveLinkOf = (leadId: number): LeadClosingCase | null => {
        const item = closing.get(leadId);
        return item &&
            item.decision.linkDealId !== null &&
            isLinkDealLive(item.decision.reason)
            ? item
            : null;
    };

    const tasks: LeadClosingTaskAction[] = [];
    for (const task of work.tasks) {
        const leadIds = task.bindings.map(leadOf).filter(id => closing.has(id));
        if (leadIds.length === 0) continue;
        const kept = task.bindings.filter(b => !leadIds.includes(leadOf(b)));
        const base = {
            taskId: task.id,
            title: task.title,
            leadIds,
            bindingsBefore: task.bindings,
            responsibleId: task.responsibleId,
        };
        if (task.bindings.some(b => b.startsWith('D_'))) {
            tasks.push({
                ...base,
                action: 'unbind',
                bindingsAfter: kept,
                dealId: null,
                dealAssignedId: 0,
            });
            continue;
        }
        const live =
            leadIds.map(liveLinkOf).find(item => item !== null) ?? null;
        if (live && live.decision.linkDealId !== null) {
            const dealId = live.decision.linkDealId;
            tasks.push({
                ...base,
                action: 'move',
                bindingsAfter: [...kept, `D_${dealId}`],
                dealId,
                dealAssignedId: live.linkDealAssignedId,
            });
            continue;
        }
        tasks.push({
            ...base,
            action: 'close',
            bindingsAfter: task.bindings,
            dealId: null,
            dealAssignedId: 0,
        });
    }

    const activities: LeadClosingActivityMove[] = [];
    for (const act of work.activities) {
        if (SKIPPED_PROVIDERS.has(act.providerId)) continue;
        const live = liveLinkOf(act.leadId);
        if (!live || live.decision.linkDealId === null) continue;
        activities.push({
            activityId: act.id,
            leadId: act.leadId,
            dealId: live.decision.linkDealId,
            providerId: act.providerId,
            subject: act.subject,
        });
    }
    return { tasks, activities };
}
