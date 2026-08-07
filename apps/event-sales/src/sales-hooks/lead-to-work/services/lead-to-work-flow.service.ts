import { Logger } from '@nestjs/common';
import { BitrixService, IBXLead } from '@/modules/bitrix';
import {
    mergeTaskCrmBindings,
    taskCrmBinding,
} from '@/modules/bitrix/domain/tasks/task/lib/task-crm-binding.util';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { PortalDeadline } from '@lib/shared/lib/date';
import { IBatchGroupBuffer } from '../../../shared/batch/batch-group-buffer.interface';
import { ILeadToWorkItem } from '../dto/lead-to-work.dto';
import { LeadToWorkContext } from './lead-to-work-context.service';
import { LeadToWorkStagePlan } from './lead-to-work-stage.resolver';

/** Префиксы задач; проверка идемпотентна — «Звонок Звонок…» не бывает. */
export const CALL_TASK_PREFIX = 'Звонок';
export const XO_TASK_PREFIX = 'Холодный обзвон';

/** Ограничение на задачи в группе — запас до лимита батча 50. */
const MAX_TASKS_IN_GROUP = 30;

/** Итог постановки команд по одному лиду. */
export interface LeadToWorkQueuedPlan {
    companyCmd?: string;
    dealCmd?: string;
    xoCmd?: string;
    taskAddCmd?: string;
    reused: boolean;
    tasksMoved: number;
    tasksClosed: number;
    warnings: string[];
}

type BxRow = Record<string, unknown>;

/**
 * Запись «лид → работа» одной группой буфера: company → deal → xo → lead →
 * задачи. Ссылки между командами — `$result[cmd]` (работает и как подстрока).
 *
 * Правила пользователя: компания из лида, если есть; иначе сделка (и ХО)
 * называются названием лида; KPI/списки не трогаем ни в одной ветке.
 * НЕ @Injectable: new LeadToWorkFlowService(bitrix, portal).
 */
export class LeadToWorkFlowService {
    private readonly logger = new Logger(LeadToWorkFlowService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    queue(
        item: ILeadToWorkItem,
        ctx: LeadToWorkContext,
        plan: LeadToWorkStagePlan,
        buffer: IBatchGroupBuffer,
    ): LeadToWorkQueuedPlan {
        const result: LeadToWorkQueuedPlan = {
            reused: !!ctx.existingOurDeal,
            tasksMoved: 0,
            tasksClosed: 0,
            warnings: [],
        };
        const eventName = this.eventName(item, ctx.lead);

        // === Компания: существующую берём за основу, новую — только по флагу.
        const companyRef = this.queueCompany(item, ctx, buffer, result);

        // === Основная сделка ОП: reuse или создание.
        const dealRef = this.queueBaseDeal(
            item,
            ctx,
            plan,
            eventName,
            companyRef,
            buffer,
            result,
        );

        // === ХО-сделка (isXo=Y): смежные сделки НЕ закрываем (не обнуляющий).
        const xoRef = this.queueXoDeal(
            item,
            ctx,
            plan,
            eventName,
            companyRef,
            buffer,
            result,
        );

        // === Лид: статус (если можно) + обратные ссылки + маркеры.
        this.queueLeadUpdate(item, ctx, plan, dealRef, xoRef, buffer, result);

        // === Задачи.
        this.queueTasks(
            item,
            ctx,
            eventName,
            companyRef,
            dealRef,
            xoRef,
            buffer,
            result,
        );

        return result;
    }

    /* ------------------------------------------------------------------ */

    private queueCompany(
        item: ILeadToWorkItem,
        ctx: LeadToWorkContext,
        buffer: IBatchGroupBuffer,
        result: LeadToWorkQueuedPlan,
    ): string | null {
        if (ctx.company) {
            return String(ctx.company.ID);
        }
        if (item.createCompany !== 'Y') return null;

        const cmd = `lw_company_${item.leadId}`;
        const lead = ctx.lead as unknown as BxRow;
        const title =
            this.text(lead.COMPANY_TITLE) ?? this.text(lead.TITLE) ?? '';
        buffer.queue(() =>
            this.bitrix.batch.company.set(cmd, {
                TITLE: title,
                ASSIGNED_BY_ID: String(item.responsible),
                LEAD_ID: String(item.leadId),
            } as never),
        );
        result.companyCmd = cmd;
        return `$result[${cmd}]`;
    }

    private queueBaseDeal(
        item: ILeadToWorkItem,
        ctx: LeadToWorkContext,
        plan: LeadToWorkStagePlan,
        eventName: string,
        companyRef: string | null,
        buffer: IBatchGroupBuffer,
        result: LeadToWorkQueuedPlan,
    ): string {
        if (ctx.existingOurDeal) {
            // Reuse: доводим связи, вторую сделку не создаём (идемпотентность).
            const dealId = String(ctx.existingOurDeal.ID);
            const cmd = `lw_deal_upd_${item.leadId}`;
            const fields: BxRow = {
                ...this.dealLinkFields(item.leadId, ctx),
            };
            if (
                companyRef &&
                !this.text((ctx.existingOurDeal as unknown as BxRow).COMPANY_ID)
            ) {
                fields.COMPANY_ID = companyRef;
            }
            buffer.queue(() =>
                this.bitrix.batch.deal.update(
                    cmd,
                    Number(dealId),
                    fields as never,
                ),
            );
            result.dealCmd = cmd;
            return dealId;
        }

        const cmd = `lw_deal_${item.leadId}`;
        const fields: BxRow = {
            TITLE: eventName,
            CATEGORY_ID: plan.dealCategoryId,
            ASSIGNED_BY_ID: String(item.responsible),
            ...this.dealLinkFields(item.leadId, ctx),
        };
        if (plan.dealStageId) fields.STAGE_ID = plan.dealStageId;
        if (companyRef) fields.COMPANY_ID = companyRef;
        const contactId = this.text((ctx.lead as unknown as BxRow).CONTACT_ID);
        if (contactId) fields.CONTACT_ID = contactId;

        buffer.queue(() => this.bitrix.batch.deal.set(cmd, fields as never));
        result.dealCmd = cmd;
        return `$result[${cmd}]`;
    }

    /** Наши поля-связи сделки; отсутствующие на портале — warning + скип. */
    private dealLinkFields(leadId: number, ctx: LeadToWorkContext): BxRow {
        const fields: BxRow = {};
        const fromLeadName = this.dealFieldName(
            PBX_SALES_EVENT_FIELD_CODES.deal_from_lead_id,
        );
        if (fromLeadName) {
            fields[fromLeadName] = `L_${leadId}`;
        }
        const joinedName = this.dealFieldName(
            PBX_SALES_EVENT_FIELD_CODES.deal_joined_leads,
        );
        if (joinedName) {
            const current = ctx.existingOurDeal
                ? this.refList(
                      (ctx.existingOurDeal as unknown as BxRow)[joinedName],
                  )
                : [];
            fields[joinedName] = mergeTaskCrmBindings(current, [`L_${leadId}`]);
        }
        return fields;
    }

    private queueXoDeal(
        item: ILeadToWorkItem,
        ctx: LeadToWorkContext,
        plan: LeadToWorkStagePlan,
        eventName: string,
        companyRef: string | null,
        buffer: IBatchGroupBuffer,
        result: LeadToWorkQueuedPlan,
    ): string | null {
        if (item.isXo !== 'Y' || !plan.xoCategoryId) return null;
        if (ctx.existingOurDeal) {
            // Reuse-режим ХО-сделку не плодит.
            return null;
        }
        const cmd = `lw_xo_${item.leadId}`;
        const fields: BxRow = {
            TITLE: `${XO_TASK_PREFIX} ${eventName}`,
            CATEGORY_ID: plan.xoCategoryId,
            ASSIGNED_BY_ID: String(item.responsible),
        };
        if (plan.xoStageId) fields.STAGE_ID = plan.xoStageId;
        if (companyRef) fields.COMPANY_ID = companyRef;
        buffer.queue(() => this.bitrix.batch.deal.set(cmd, fields as never));
        result.xoCmd = cmd;
        return `$result[${cmd}]`;
    }

    private queueLeadUpdate(
        item: ILeadToWorkItem,
        ctx: LeadToWorkContext,
        plan: LeadToWorkStagePlan,
        dealRef: string,
        xoRef: string | null,
        buffer: IBatchGroupBuffer,
        result: LeadToWorkQueuedPlan,
    ): void {
        const fields: BxRow = {};
        if (plan.leadStatusId) fields.STATUS_ID = plan.leadStatusId;

        const toBase = this.leadFieldName(
            PBX_SALES_EVENT_FIELD_CODES.to_base_sales,
        );
        if (toBase) fields[toBase] = this.asDealRef(dealRef);
        const toXo = this.leadFieldName(
            PBX_SALES_EVENT_FIELD_CODES.to_xo_sales,
        );
        if (toXo && xoRef) fields[toXo] = this.asDealRef(xoRef);

        const isCompany = this.leadFieldName(
            PBX_SALES_EVENT_FIELD_CODES.op_lead_is_company,
        );
        if (isCompany && (ctx.company || result.companyCmd)) {
            fields[isCompany] = 1;
        }
        const statusField = this.portal.getEntityFieldByCode(
            'lead',
            PBX_SALES_EVENT_FIELD_CODES.op_lead_status,
        );
        if (statusField) {
            const itemCode =
                ctx.company || result.companyCmd
                    ? 'op_lead_status_five' // «Работа с компанией»
                    : 'op_lead_status_four'; // «Работа со сделкой»
            const statusItem = statusField.items.find(
                listItem => listItem.code === itemCode,
            );
            if (statusItem) {
                fields[this.portal.getFieldBitrixId(statusField)] =
                    statusItem.bitrixId;
            }
        }

        if (Object.keys(fields).length === 0) return;
        const cmd = `lw_lead_${item.leadId}`;
        buffer.queue(() =>
            this.bitrix.batch.lead.update(cmd, item.leadId, fields as never),
        );
    }

    private queueTasks(
        item: ILeadToWorkItem,
        ctx: LeadToWorkContext,
        eventName: string,
        companyRef: string | null,
        dealRef: string,
        xoRef: string | null,
        buffer: IBatchGroupBuffer,
        result: LeadToWorkQueuedPlan,
    ): void {
        const groupId = this.portal.getSalesTaskGroupId();
        const bindings = this.taskBindings(
            item.leadId,
            companyRef,
            dealRef,
            xoRef,
        );
        const closeAll = item.taskMode === 'close' || item.isXo === 'Y';

        let tasks = ctx.openTasks;
        if (tasks.length > MAX_TASKS_IN_GROUP) {
            result.warnings.push(
                `Открытых задач ${tasks.length} — обработаны первые ${MAX_TASKS_IN_GROUP} (лимит batch-группы)`,
            );
            tasks = tasks.slice(0, MAX_TASKS_IN_GROUP);
        }

        for (const task of tasks) {
            const taskId = Number(
                (task as unknown as BxRow).id ?? (task as unknown as BxRow).ID,
            );
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

            const rawTitle =
                this.text((task as unknown as BxRow).title) ??
                this.text((task as unknown as BxRow).TITLE) ??
                '';
            const currentBindings = this.refList(
                (task as unknown as BxRow).ufCrmTask ??
                    (task as unknown as BxRow).UF_CRM_TASK,
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
        if (!needNewTask) return;

        const prefix = item.isXo === 'Y' ? XO_TASK_PREFIX : CALL_TASK_PREFIX;
        const cmd = `lw_task_add_${item.leadId}`;
        const payload: BxRow = {
            TITLE: `${prefix} ${eventName}`,
            RESPONSIBLE_ID: item.responsible,
            UF_CRM_TASK: bindings,
            ...(groupId ? { GROUP_ID: groupId } : {}),
        };
        if (item.deadline) {
            payload.DEADLINE = PortalDeadline.fromPortalInput(
                item.deadline,
                this.portal.getTimezone(),
            ).toTaskDeadline();
        }
        buffer.queue(() => this.bitrix.batch.task.add(cmd, payload as never));
        result.taskAddCmd = cmd;
    }

    /* ------------------------------------------------------------------ */

    /** Название события: имя из хука → название компании → название лида. */
    private eventName(item: ILeadToWorkItem, lead: IBXLead): string {
        const row = lead as unknown as BxRow;
        return (
            this.text(item.name) ??
            this.text(row.COMPANY_TITLE) ??
            this.text(row.TITLE) ??
            `Лид ${item.leadId}`
        );
    }

    private taskBindings(
        leadId: number,
        companyRef: string | null,
        dealRef: string,
        xoRef: string | null,
    ): string[] {
        const bindings = [
            taskCrmBinding('LEAD', leadId),
            taskCrmBinding('DEAL', dealRef),
        ];
        if (companyRef) bindings.push(taskCrmBinding('COMPANY', companyRef));
        if (xoRef) bindings.push(taskCrmBinding('DEAL', xoRef));
        return bindings;
    }

    /** Префикс один раз: повторный хук не даёт «Звонок Звонок …». */
    private withPrefix(title: string, prefix: string): string {
        return title.startsWith(prefix) ? title : `${prefix} ${title}`.trim();
    }

    /** `5` → `D_5`; `$result[cmd]` → `D_$result[cmd]` (подстановка-подстрока). */
    private asDealRef(ref: string): string {
        return `D_${ref}`;
    }

    private leadFieldName(code: string): string | null {
        const field = this.portal.getEntityFieldByCode('lead', code);
        return field ? this.portal.getFieldBitrixId(field) : null;
    }

    private dealFieldName(code: string): string | null {
        const field = this.portal.getEntityFieldByCode('deal', code);
        return field ? this.portal.getFieldBitrixId(field) : null;
    }

    private refList(raw: unknown): string[] {
        if (raw == null) return [];
        const items = Array.isArray(raw) ? raw : [raw];
        return items
            .map(value =>
                typeof value === 'string' || typeof value === 'number'
                    ? String(value).trim()
                    : '',
            )
            .filter(Boolean);
    }

    private text(raw: unknown): string | null {
        if (typeof raw === 'string') {
            const value = raw.trim();
            return value || null;
        }
        if (typeof raw === 'number' || typeof raw === 'bigint') {
            return String(raw);
        }
        return null;
    }
}
