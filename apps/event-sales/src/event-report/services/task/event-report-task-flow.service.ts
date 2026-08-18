import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { ETaskPriority } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { mergeTaskCrmBindings } from '@/modules/bitrix/domain/tasks/task/lib/task-crm-binding.util';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { EventReportContext } from '../context/event-report.context';
import {
    COLD_EVENT_TYPE_TO_WORK_KIND,
    isColdEventType,
} from '../../types/event-report.event-codes';
import {
    coldTaskTypeName,
    LEAD_WORK_KIND,
    LeadWorkKind,
} from '../../../shared/event-title';
import { EEventReportEntityType } from '../init/event-report-init.types';
import { DealFlowResult } from '../deal/event-report-deal-flow.service';

/**
 * Эмодзи-маркеры «важных» планов (legacy `isPlannedImportant`).
 * Добавляются перед русским названием типа события — фронт парсит TITLE
 * по подстроке («Презентация», «Звонок», «Холодный обзвон», ...) и по этому
 * вычисляет `task.eventType`. Любая правка формата ломает фронт.
 */
const TITLE_EMOJI_BY_PLAN_TYPE: Record<string, string> = {
    presentation: '⚡',
    hot: '🔥',
    moneyAwait: '💎',
    refine: '🔧',
};

/**
 * «Важные» планы — задача ставится с HIGH-приоритетом. Отдельно от эмодзи:
 * у доработки СВОЙ значок в TITLE, но приоритет обычный (MEDIUM) — она
 * не горящий шаг воронки, а фоновая работа с клиентом.
 */
const IMPORTANT_PLAN_TYPES = new Set(['presentation', 'hot', 'moneyAwait']);

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
            // Bitrix хранит DEADLINE задач в server-time (Москва) — сырую
            // строку плана слать нельзя, на не-московском портале время уедет.
            if (ctx.planDeadline) {
                this.bitrix.batch.task.update(
                    `update_task_${currentTaskId}`,
                    currentTaskId,
                    {
                        DEADLINE: ctx.planDeadline.toTaskDeadline(),
                        ALLOW_CHANGE_DEADLINE: 'Y',
                    },
                );
            }
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
                DEADLINE: ctx.planDeadline?.toTaskDeadline() ?? '',
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
     * - холодные типы → «Холодный обзвон» + слово вида («. Заявка.» / «. Лид.»);
     * - presentation/hot/moneyAwait → эмодзи + русское имя из DTO;
     * - остальные → русское имя из DTO как есть.
     */
    private resolveTypeName(ctx: EventReportContext): string {
        const coldKind = this.resolveColdKind(ctx);
        if (coldKind) return coldTaskTypeName(COLD_TASK_TYPE_NAME, coldKind);

        const dtoName = ctx.dto.plan?.type?.current?.name?.trim() ?? '';
        const prefix =
            ctx.planEventType && TITLE_EMOJI_BY_PLAN_TYPE[ctx.planEventType];
        if (prefix && dtoName) return `${prefix} ${dtoName}`;
        return dtoName;
    }

    /**
     * Вид холодной работы для следующей задачи; null — план не холодный.
     *
     * Почему смотрим и на ОТЧЁТ, а не только на план: справочник планов
     * (`EnumEventPlanCode`) знает единственный холодный код `cold`, поэтому
     * при планировании следующего звонка по ЗАЯВКЕ план приезжает как `xo`.
     * Если взять только его, слово «Заявка» из заголовка пропадёт — и фронт
     * прочитает следующую задачу как обычный холодный обзвон, а менеджер
     * настроится не на тот разговор. Поэтому вид наследуется от события,
     * по которому отчитались, пока план не скажет иное явно.
     */
    private resolveColdKind(ctx: EventReportContext): LeadWorkKind | null {
        if (!isColdEventType(ctx.planEventType)) return null;
        const planKind = COLD_EVENT_TYPE_TO_WORK_KIND[ctx.planEventType];
        if (planKind !== LEAD_WORK_KIND.cold) return planKind;
        return isColdEventType(ctx.reportEventType)
            ? COLD_EVENT_TYPE_TO_WORK_KIND[ctx.reportEventType]
            : LEAD_WORK_KIND.cold;
    }

    private isPlannedImportant(ctx: EventReportContext): boolean {
        return Boolean(
            ctx.planEventType && IMPORTANT_PLAN_TYPES.has(ctx.planEventType),
        );
    }

    /**
     * Порядок ссылок в `UF_CRM_TASK` повторяет legacy:
     *   L_<lead> → C_<planContact> → D_<владелец> → D_<base> →
     *   D_<plannedPres> → D_<unplannedPres> → CO_<company>.
     */
    private buildCrmTaskLinks(
        ctx: EventReportContext,
        deals: DealFlowResult,
    ): string[] {
        const links: string[] = [];

        if (ctx.entityType === EEventReportEntityType.LEAD && ctx.entityId) {
            links.push(`L_${ctx.entityId}`);
        }

        // Лид не должен теряться при работе из сделки/компании: следующая
        // задача наследует L_* текущей задачи и лиды-первоисточники сделки
        // (deal_from_lead_id / deal_joined_leads / LEAD_ID) — из лида видно,
        // что происходит с работой.
        links.push(...this.collectInheritedLeadLinks(ctx));

        // Заявка, с которой менеджер связал презентацию (модалка перед
        // отправкой) — следующая задача обязана нести её L_-привязку.
        const linkedLead = ctx.dto.leadSync?.presentationLink
            ? Number(ctx.dto.leadSync.leadId)
            : NaN;
        if (Number.isFinite(linkedLead) && linkedLead > 0) {
            links.push(`L_${linkedLead}`);
        }

        // Лиды, отмеченные менеджером при создании задачи из сделки/компании
        // без текущей задачи (чекбоксы «связано с этими заявками?»).
        for (const rawId of ctx.dto.plan?.relatedLeadIds ?? []) {
            const id = Number(rawId);
            if (Number.isFinite(id) && id > 0) {
                links.push(`L_${id}`);
            }
        }

        const planContactId = ctx.dto.plan?.contact?.ID;
        if (planContactId) {
            links.push(`C_${planContactId}`);
        }

        // Владелец-сделка: задача обязана ссылаться на неё — иначе кейс
        // «сделка без компании» оставит задачу вообще без CRM-привязки.
        if (ctx.entityType === EEventReportEntityType.DEAL && ctx.entityId) {
            links.push(`D_${ctx.entityId}`);
        }

        if (
            deals.baseDealId &&
            String(deals.baseDealId) !== String(ctx.entityId)
        ) {
            links.push(`D_${deals.baseDealId}`);
        }
        if (deals.newPlanPresDealId) {
            links.push(`D_${deals.newPlanPresDealId}`);
        }
        if (deals.newUnplannedPresDealId) {
            links.push(`D_${deals.newUnplannedPresDealId}`);
        }

        if (ctx.entityType === EEventReportEntityType.COMPANY && ctx.entityId) {
            links.push(`CO_${ctx.entityId}`);
        }

        // Дедуп с сохранением порядка первого вхождения (legacy-порядок цел).
        return mergeTaskCrmBindings(links, []);
    }

    /**
     * `L_*`-привязки, которые новая задача обязана унаследовать:
     *  1) из текущей задачи (UF_CRM_TASK) — лид уже был в цепочке;
     *  2) из сделки-владельца: deal_from_lead_id, deal_joined_leads (наши
     *     поля графа) и штатный LEAD_ID — работа началась ХО-хуком из лида.
     */
    private collectInheritedLeadLinks(ctx: EventReportContext): string[] {
        const leads: string[] = [];
        const push = (raw: unknown): void => {
            const values = Array.isArray(raw) ? raw : [raw];
            for (const value of values) {
                if (value == null) continue;
                const match = /^(?:L_)?(\d+)$/.exec(String(value).trim());
                if (match && Number(match[1]) > 0) {
                    leads.push(`L_${match[1]}`);
                }
            }
        };

        const task = ctx.currentTask as unknown as Record<
            string,
            unknown
        > | null;
        const taskBindings = task?.ufCrmTask ?? task?.UF_CRM_TASK;
        if (Array.isArray(taskBindings)) {
            for (const binding of taskBindings) {
                if (typeof binding === 'string' && binding.startsWith('L_')) {
                    push(binding);
                }
            }
        }

        const deal = ctx.ownerDeal as unknown as Record<string, unknown> | null;
        if (deal) {
            push(deal.LEAD_ID);
            for (const code of [
                PBX_SALES_EVENT_FIELD_CODES.deal_from_lead_id,
                PBX_SALES_EVENT_FIELD_CODES.deal_joined_leads,
            ]) {
                const field = this.portal.getEntityFieldByCode('deal', code);
                if (!field) continue;
                push(deal[this.portal.getFieldBitrixId(field)]);
            }
        }

        return leads;
    }
}
