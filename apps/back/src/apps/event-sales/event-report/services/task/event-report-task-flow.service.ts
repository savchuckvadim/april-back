import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { ETaskPriority } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { PortalModel } from '@lib/portal/services/portal.model';
import { EventReportContext } from '../context/event-report.context';
import { DealFlowResult } from '../deal/event-report-deal-flow.service';

/**
 * Эмодзи-маркеры «важных» планов (legacy `isPlannedImportant`).
 * Добавляются перед русским названием типа события — фронт парсит TITLE
 * по подстроке («Презентация», «Звонок», «Холодный обзвон», ...) и по этому
 * вычисляет `task.eventType`. Любая правка формата ломает фронт.
 */
const IMPORTANT_PREFIX_BY_PLAN_TYPE: Record<string, string> = {
    presentation: '⚡',
    hot: '🔥',
    moneyAwait: '💎',
};

/** Cold/xo — фиксированное русское название (legacy `$stringType`). */
const COLD_TASK_TYPE_NAME = 'Холодный обзвон';

/**
 * Task flow event-report (legacy `BitrixTaskService::getCreateTaskBatchCommands`
 * + `getUpdateTaskBatchCommand`).
 *
 * Маршрутизация:
 *  - `isExpired && currentTask`
 *      → ТОЛЬКО `update` дедлайна (legacy update меняет только DEADLINE и
 *        ALLOW_CHANGE_DEADLINE; TITLE/UF_CRM_TASK/комментарии не трогает).
 *  - иначе:
 *      • если есть `currentTask` и `!isNew` (менеджер отчитался) →
 *        `complete(currentTask)` — независимо от плана;
 *      • если `isPlanned` → `add(newTask)`.
 *
 * Поле комментария — `UF_TASK_EVENT_COMMENT` (legacy имя).
 *
 * TITLE формат (legacy):
 *   `<typeName>  <eventName>  <contactName?>`  (двойные пробелы между).
 * `typeName` — `plan.type.current.name` из DTO (русское), для cold/xo
 * перетирается на «Холодный обзвон»; для presentation/hot/moneyAwait
 * добавляется эмодзи спереди.
 */
export class EventReportTaskFlowService {
    private readonly logger = new Logger(EventReportTaskFlowService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    queue(ctx: EventReportContext, deals: DealFlowResult): void {
        const currentTaskId = ctx.currentTask?.id
            ? Number(ctx.currentTask.id)
            : null;

        if (ctx.isExpired && currentTaskId) {
            this.bitrix.batch.task.update(
                `update_task_${currentTaskId}`,
                currentTaskId,
                {
                    DEADLINE: ctx.planDeadline,
                    ALLOW_CHANGE_DEADLINE: 'Y',
                },
            );
            return;
        }

        if (currentTaskId && !ctx.isNew) {
            this.bitrix.batch.task.complete(
                `complete_task_${currentTaskId}`,
                currentTaskId,
            );
        }

        if (ctx.isPlanned) {
            this.bitrix.batch.task.add('add_task', {
                TITLE: this.buildTitle(ctx),
                RESPONSIBLE_ID: ctx.planResponsibleId,
                CREATED_BY: ctx.planCreatedById || ctx.planResponsibleId,
                DEADLINE: ctx.planDeadline,
                ALLOW_CHANGE_DEADLINE: 'Y',
                PRIORITY: this.isPlannedImportant(ctx)
                    ? ETaskPriority.HIGH
                    : ETaskPriority.MEDIUM,
                GROUP_ID: this.portal.getSalesTaskGroupId(),
                UF_CRM_TASK: this.buildCrmTaskLinks(ctx, deals),
                UF_TASK_EVENT_COMMENT: ctx.reportComment,
            });
        }
    }

    /**
     * TITLE = `<typeName>  <eventName>  <contactName?>` (двойной пробел между).
     */
    private buildTitle(ctx: EventReportContext): string {
        const typeName = this.resolveTypeName(ctx);
        const eventName = ctx.planEventName?.trim() ?? '';
        const contactName = ctx.dto.plan?.contact?.NAME?.trim() ?? '';

        let title = `${typeName}  ${eventName}`.trim();
        if (contactName) title += `  ${contactName}`;
        return title;
    }

    /**
     * Имя типа события для TITLE задачи.
     * - cold/xo → фиксированное «Холодный обзвон»;
     * - presentation/hot/moneyAwait → эмодзи + русское имя из DTO;
     * - остальные → русское имя из DTO как есть.
     */
    private resolveTypeName(ctx: EventReportContext): string {
        if (ctx.planEventType === 'xo') return COLD_TASK_TYPE_NAME;

        const dtoName = ctx.dto.plan?.type?.current?.name?.trim() ?? '';
        const prefix =
            ctx.planEventType &&
            IMPORTANT_PREFIX_BY_PLAN_TYPE[ctx.planEventType];
        if (prefix && dtoName) return `${prefix} ${dtoName}`;
        return dtoName;
    }

    private isPlannedImportant(ctx: EventReportContext): boolean {
        return Boolean(
            ctx.planEventType &&
                ctx.planEventType in IMPORTANT_PREFIX_BY_PLAN_TYPE,
        );
    }

    /**
     * Порядок ссылок в `UF_CRM_TASK` повторяет legacy:
     *   L_<lead> → C_<planContact> → D_<base> → D_<plannedPres> →
     *   D_<unplannedPres> → CO_<company>.
     */
    private buildCrmTaskLinks(
        ctx: EventReportContext,
        deals: DealFlowResult,
    ): string[] {
        const links: string[] = [];

        if (ctx.entityType === 'lead' && ctx.entityId) {
            links.push(`L_${ctx.entityId}`);
        }

        const planContactId = ctx.dto.plan?.contact?.ID;
        if (planContactId) {
            links.push(`C_${planContactId}`);
        }

        if (deals.baseDealId) {
            links.push(`D_${deals.baseDealId}`);
        }
        if (deals.newPlanPresDealId) {
            links.push(`D_${deals.newPlanPresDealId}`);
        }
        if (deals.newUnplannedPresDealId) {
            links.push(`D_${deals.newUnplannedPresDealId}`);
        }

        if (ctx.entityType === 'company' && ctx.entityId) {
            links.push(`CO_${ctx.entityId}`);
        }

        return links;
    }
}
