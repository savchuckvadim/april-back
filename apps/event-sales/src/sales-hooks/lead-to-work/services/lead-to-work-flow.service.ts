import { Logger } from '@nestjs/common';
import { BitrixService, IBXLead } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PortalDeadline } from '@lib/shared/lib/date';
import { LeadUfDefinitions } from '../../../shared/portal-fields';
import { IBatchGroupBuffer } from '../../../shared/batch/batch-group-buffer.interface';
import { ResolvedLeadToWorkItem } from '../dto/lead-to-work.dto';
import { LeadToWorkContext } from './lead-to-work-context.service';
import { LeadToWorkStagePlan } from './lead-to-work-stage.resolver';
import {
    LeadRequestDetection,
    LeadRequestDetectorService,
} from './lead-request-detector.service';
import {
    ILeadToWorkKpiRefs,
    LeadToWorkKpiService,
} from './lead-to-work-kpi.service';
import { IXoEventContext } from './models/xo-event-entity.model';
import {
    CALL_TASK_PREFIX,
    XO_TASK_PREFIX,
} from './flows/lead-to-work-flow.base';
import { DealConsolidationService } from './flows/deal-consolidation.service';
import { CompanyFlowService } from './flows/company-flow.service';
import { DealFlowService } from './flows/deal-flow.service';
import { LeadFlowService } from './flows/lead-flow.service';
import { TaskFlowService } from './flows/task-flow.service';

export { CALL_TASK_PREFIX, XO_TASK_PREFIX };

/** Итог постановки команд по одному лиду. */
export interface LeadToWorkQueuedPlan {
    companyCmd?: string;
    dealCmd?: string;
    xoCmd?: string;
    taskAddCmd?: string;
    reused: boolean;
    tasksMoved: number;
    tasksClosed: number;
    /** Лишние ОТКРЫТЫЕ сделки лида, закрытые в fail (пары не плодятся). */
    extraDealsClosed: number;
    /** Лид распознан как заявка (лидоген/сайт) — см. LeadRequestDetector. */
    isRequest: boolean;
    /** KPI «Холодный звонок Запланирован» поставлен в группу (ХО-ветка). */
    kpiPlanned: boolean;
    /** KPI «Не состоялся» прежнему ответственному (передача обзвона). */
    kpiNotHeld: boolean;
    warnings: string[];
}

type BxRow = Record<string, unknown>;

/**
 * ОРКЕСТРАТОР записи «лид → работа»: одна группа буфера, порядок
 * company → deal → xo → lead → задачи → KPI. Ссылки между командами —
 * `$result[cmd]`, поэтому вся группа обязана уехать одним batch'ем.
 *
 * Сам ничего не пишет: за каждую сущность отвечает свой flow-сервис
 * (`flows/*`), за значения полей — модели (`models/*`), за KPI —
 * LeadToWorkKpiService. Здесь только последовательность шагов, передача
 * ссылок между ними и сборка итога — чтобы «где что происходит» читалось
 * с одного экрана.
 *
 * НЕ @Injectable: new LeadToWorkFlowService(bitrix, portal, ufDefinitions).
 */
export class LeadToWorkFlowService {
    private readonly logger = new Logger(LeadToWorkFlowService.name);
    private readonly detector: LeadRequestDetectorService;
    private readonly kpi: LeadToWorkKpiService;
    private readonly consolidation: DealConsolidationService;
    private readonly companyFlow: CompanyFlowService;
    private readonly dealFlow: DealFlowService;
    private readonly leadFlow: LeadFlowService;
    private readonly taskFlow: TaskFlowService;

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
        /**
         * Фактические определения UF-полей лида с портала (привязки crm).
         * От них зависит ФОРМАТ значения связей; пусто — дефолт с префиксом.
         */
        ufDefinitions: LeadUfDefinitions = {},
        /** Имена сотрудников для читаемой истории; нет — пишем id. */
        private readonly userNames: Record<number, string> = {},
    ) {
        this.detector = new LeadRequestDetectorService(portal);
        this.kpi = new LeadToWorkKpiService(bitrix, portal);
        this.consolidation = new DealConsolidationService(bitrix, portal);
        this.companyFlow = new CompanyFlowService(bitrix, portal);
        this.dealFlow = new DealFlowService(bitrix, portal);
        this.leadFlow = new LeadFlowService(bitrix, portal, ufDefinitions);
        this.taskFlow = new TaskFlowService(bitrix, portal);
    }

    queue(
        item: ResolvedLeadToWorkItem,
        ctx: LeadToWorkContext,
        plan: LeadToWorkStagePlan,
        buffer: IBatchGroupBuffer,
        /** Инициатор операции — автор KPI-событий; нет — ответственный. */
        authorId: number | null = null,
    ): LeadToWorkQueuedPlan {
        // Заявка или просто лид: явный флаг робота главнее автодетекта
        // (робот воронки заявок ЗНАЕТ природу лида; поля могут быть пусты).
        const detection = this.detect(item, ctx);

        // Инвариант «одна открытая пара»: лишние сделки закрываются ДО
        // записи, дальше работаем с главной основной и главной ХО.
        const consolidated = this.consolidation.consolidate(
            item,
            ctx,
            plan,
            buffer,
        );
        ctx = consolidated.ctx;

        const result: LeadToWorkQueuedPlan = {
            reused: !!ctx.existingOurDeal,
            tasksMoved: 0,
            tasksClosed: 0,
            extraDealsClosed: consolidated.closed,
            isRequest: detection.isRequest,
            kpiPlanned: false,
            kpiNotHeld: false,
            warnings: [...consolidated.warnings],
        };

        const eventName = this.eventName(item, ctx.lead);
        const xoTitle = this.xoTitle(eventName, detection);
        /*
         * Контекст события ХО: по нему модели считают событийные поля
         * (xo_name/xo_date/call_next_date/op_history/op_work_status…) — тот
         * же набор, что пишет классический холодный обзвон. null — ветка не
         * ХО либо дедлайн не распознан: событийные поля просто не пишутся.
         */
        const eventCtx =
            item.isXo === 'Y'
                ? this.eventContext(item, eventName, authorId)
                : null;

        // === Компания: существующую берём за основу, новую — по флагу.
        const company = this.companyFlow.queue(item, ctx, eventCtx, buffer);
        result.companyCmd = company.createdCmd;

        // === Основная сделка ОП: reuse или создание.
        const baseDeal = this.dealFlow.queueBase(
            item,
            ctx,
            plan,
            eventName,
            company.ref,
            eventCtx,
            buffer,
        );
        result.dealCmd = baseDeal.cmd;

        // === ХО-сделка (isXo=Y).
        const xoDeal = this.dealFlow.queueXo(
            item,
            ctx,
            plan,
            xoTitle,
            company.ref,
            eventCtx,
            buffer,
        );
        result.xoCmd = xoDeal.cmd;

        // === Лид: стадия, ответственный, связи, метки, история.
        const lead = this.leadFlow.queue(
            item,
            ctx,
            plan,
            {
                dealRef: baseDeal.ref ?? '',
                xoRef: xoDeal.ref,
                detection,
                eventCtx,
                hasCompany: Boolean(ctx.company || company.createdCmd),
                userNames: this.userNames,
            },
            buffer,
        );
        result.warnings.push(...lead.warnings);

        // === Задачи: перенос с префиксом «Звонок» либо закрытие + новая.
        const tasks = this.taskFlow.queue(
            item,
            ctx,
            {
                eventName,
                xoTitle,
                companyRef: company.ref,
                dealRef: baseDeal.ref ?? '',
                xoRef: xoDeal.ref,
            },
            buffer,
        );
        result.tasksMoved = tasks.tasksMoved;
        result.tasksClosed = tasks.tasksClosed;
        result.taskAddCmd = tasks.addCmd;
        result.warnings.push(...tasks.warnings);

        // === KPI/History (только ХО-ветка) — в ТУ ЖЕ группу, до endGroup().
        this.queueKpi(
            item,
            ctx,
            {
                eventName,
                detection,
                authorId,
                companyRef: company.ref,
                dealRef: baseDeal.ref ?? '',
                xoRef: xoDeal.ref,
            },
            buffer,
            result,
        );

        return result;
    }

    /* ------------------------------------------------------------------ */

    /** Природа лида: явный флаг робота главнее автодетекта по полям. */
    private detect(
        item: ResolvedLeadToWorkItem,
        ctx: LeadToWorkContext,
    ): LeadRequestDetection {
        if (item.isRequest === 'Y') {
            return { isRequest: true, signals: ['флаг робота isRequest=Y'] };
        }
        if (item.isRequest === 'N') return { isRequest: false, signals: [] };
        return this.detector.detect(ctx.lead as unknown as BxRow);
    }

    /**
     * KPI/History ХО-ветки — в ту же batch-группу лида (ссылки $result
     * на создаваемые сделки валидны только до endGroup()).
     *
     * Передача обзвона: прежнему ответственному пишется «Не состоялся»,
     * новому — «Запланирован». Старые элементы списков не трогаются.
     */
    private queueKpi(
        item: ResolvedLeadToWorkItem,
        ctx: LeadToWorkContext,
        input: {
            eventName: string;
            detection: LeadRequestDetection;
            authorId: number | null;
            companyRef: string | null;
            dealRef: string;
            xoRef: string | null;
        },
        buffer: IBatchGroupBuffer,
        result: LeadToWorkQueuedPlan,
    ): void {
        if (item.isXo !== 'Y') return;

        const refs: ILeadToWorkKpiRefs = {
            leadId: item.leadId,
            companyRef: input.companyRef,
            baseDealRef: input.dealRef,
            xoDealRef: input.xoRef,
            companyId: ctx.company ? Number(ctx.company.ID) : null,
        };
        const deadline = item.deadline
            ? PortalDeadline.fromPortalInput(
                  item.deadline,
                  this.portal.getTimezone(),
              )
            : null;

        const prev = this.leadFlow.prevResponsible(ctx);
        if (prev && prev !== item.responsible) {
            this.kpi.queueNotHeld(
                {
                    refs,
                    name: input.eventName,
                    isRequest: input.detection.isRequest,
                    prevResponsibleId: prev,
                    authorId: input.authorId,
                },
                buffer,
            );
            result.kpiNotHeld = true;
        }

        this.kpi.queuePlanned(
            {
                refs,
                name: input.eventName,
                isRequest: input.detection.isRequest,
                responsibleId: item.responsible,
                authorId: input.authorId,
                deadline,
            },
            buffer,
        );
        result.kpiPlanned = true;
    }

    /**
     * Общий контекст события ХО для всех моделей сущностей. Дедлайн —
     * из параметра хука; строка не парсится (робот прислал мусор) → null,
     * и событийные поля времени просто не пишутся (graceful).
     */
    private eventContext(
        item: ResolvedLeadToWorkItem,
        eventName: string,
        authorId: number | null,
    ): IXoEventContext | null {
        const tz = this.portal.getTimezone();
        let deadline: PortalDeadline | null = null;
        if (item.deadline) {
            try {
                deadline = PortalDeadline.fromPortalInput(item.deadline, tz);
            } catch {
                this.logger.warn(
                    `[event-fields] дедлайн «${item.deadline}» не распознан — событийные поля ХО пропущены`,
                );
            }
        }
        if (!deadline) return null;
        return {
            eventName,
            deadline,
            responsibleId: item.responsible,
            xoCreatedById: authorId ?? item.responsible,
            timezone: tz,
        };
    }

    /** «Холодный обзвон. Заявка. {name}» либо «Холодный обзвон {name}». */
    private xoTitle(
        eventName: string,
        detection: LeadRequestDetection,
    ): string {
        return detection.isRequest
            ? `${XO_TASK_PREFIX}. Заявка. ${eventName}`
            : `${XO_TASK_PREFIX} ${eventName}`;
    }

    /** Название события: имя из хука → название компании → название лида. */
    private eventName(item: ResolvedLeadToWorkItem, lead: IBXLead): string {
        const row = lead as unknown as BxRow;
        return (
            this.text(item.name) ??
            this.text(row.COMPANY_TITLE) ??
            this.text(row.TITLE) ??
            `Лид ${item.leadId}`
        );
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
