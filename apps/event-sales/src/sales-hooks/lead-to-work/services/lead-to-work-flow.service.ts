import { Logger } from '@nestjs/common';
import { BitrixService, IBXLead } from '@/modules/bitrix';
import {
    mergeTaskCrmBindings,
    taskCrmBinding,
} from '@/modules/bitrix/domain/tasks/task/lib/task-crm-binding.util';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { PortalDeadline } from '@lib/shared/lib/date';
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
import {
    IXoEventContext,
    XoEventEntityModel,
} from './models/xo-event-entity.model';
import { LeadXoEventEntityModel } from './models/lead-xo-event-entity.model';
import {
    buildCrmRefValue,
    LeadUfDefinitions,
} from '../../../shared/portal-fields';

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
 * Запись «лид → работа» одной группой буфера: company → deal → xo → lead →
 * задачи → KPI. Ссылки между командами — `$result[cmd]` (работает и как
 * подстрока).
 *
 * Правила пользователя: компания из лида, если есть; иначе сделка (и ХО)
 * называются названием лида. Связи графа пишутся ВСЕГДА и на ВСЕ сделки:
 * лид получает to_base_sales/to_xo_sales, каждая наша сделка (основная И
 * ХО) — deal_from_lead_id + deal_joined_leads.
 *
 * KPI: в ХО-ветке (isXo=Y) пишется «Холодный звонок Запланирован», при
 * передаче обзвона другому менеджеру — прежнему пишется «Не состоялся».
 * Прошлые элементы списков НИКОГДА не редактируются (README §6).
 *
 * НЕ @Injectable: new LeadToWorkFlowService(bitrix, portal).
 */
export class LeadToWorkFlowService {
    private readonly logger = new Logger(LeadToWorkFlowService.name);
    private readonly detector: LeadRequestDetectorService;
    private readonly kpi: LeadToWorkKpiService;

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
        /**
         * Фактические определения UF-полей лида с портала (привязки crm).
         * От них зависит ФОРМАТ значения связей; пусто — дефолт с префиксом.
         */
        private readonly ufDefinitions: LeadUfDefinitions = {},
    ) {
        this.detector = new LeadRequestDetectorService(portal);
        this.kpi = new LeadToWorkKpiService(bitrix, portal);
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
        const detection: LeadRequestDetection =
            item.isRequest === 'Y'
                ? { isRequest: true, signals: ['флаг робота isRequest=Y'] }
                : item.isRequest === 'N'
                  ? { isRequest: false, signals: [] }
                  : this.detector.detect(ctx.lead as unknown as BxRow);

        /*
         * ИНВАРИАНТ «одна пара» (правило пользователя, как классический ХО):
         * у лида не может копиться по паре сделок на каждый прогон. Главной
         * основной становится ПОСЛЕДНЯЯ открытая (max ID), главной ХО —
         * последняя открытая ХО; остальные открытые закрываются в fail
         * своей воронки. Кандидаты собраны контекстом по to_base_sales,
         * deal_from_lead_id и LEAD_ID.
         */
        const consolidated = this.consolidateDeals(item, ctx, plan, buffer);
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

        // === Компания: существующую берём за основу, новую — только по флагу.
        const companyRef = this.queueCompany(
            item,
            ctx,
            eventCtx,
            buffer,
            result,
        );

        // === Основная сделка ОП: reuse или создание.
        const dealRef = this.queueBaseDeal(
            item,
            ctx,
            plan,
            eventName,
            companyRef,
            eventCtx,
            buffer,
            result,
        );

        // === ХО-сделка (isXo=Y): смежные сделки НЕ закрываем (не обнуляющий).
        const xoRef = this.queueXoDeal(
            item,
            ctx,
            plan,
            this.xoTitle(eventName, detection),
            companyRef,
            eventCtx,
            buffer,
            result,
        );

        // === Лид: статус (если можно) + обратные ссылки + маркеры.
        this.queueLeadUpdate(
            item,
            ctx,
            plan,
            dealRef,
            xoRef,
            detection,
            eventCtx,
            buffer,
            result,
        );

        // === Задачи.
        this.queueTasks(
            item,
            ctx,
            eventName,
            detection,
            companyRef,
            dealRef,
            xoRef,
            buffer,
            result,
        );

        // === KPI/History (только ХО-ветка) — в ТУ ЖЕ группу, до endGroup().
        this.queueKpi(
            item,
            ctx,
            eventName,
            detection,
            authorId,
            companyRef,
            dealRef,
            xoRef,
            buffer,
            result,
        );

        return result;
    }

    /* ------------------------------------------------------------------ */

    /**
     * Сведение сделок лида к инварианту «одна открытая пара»:
     *  - кандидаты: to_base_sales/to_xo_sales лида + свои по
     *    deal_from_lead_id + конвертационные по LEAD_ID (дедуп по ID);
     *  - главная основная/ХО = ссылка лида, если жива, иначе ПОСЛЕДНЯЯ
     *    открытая своей воронки (max ID);
     *  - остальные ОТКРЫТЫЕ сделки этих воронок закрываются в fail-стадию
     *    («не состоялась»); fail не сопоставлена → warning, не трогаем.
     * Закрытые сделки не трогаются никогда (прошлое не переписываем).
     */
    private consolidateDeals(
        item: ResolvedLeadToWorkItem,
        ctx: LeadToWorkContext,
        plan: LeadToWorkStagePlan,
        buffer: IBatchGroupBuffer,
    ): { ctx: LeadToWorkContext; closed: number; warnings: string[] } {
        const warnings: string[] = [];
        const byId = new Map<number, BxRow>();
        const candidates = [
            ctx.existingOurDeal,
            ctx.existingXoDeal,
            ...ctx.convertedDeals,
            ...ctx.fromLeadDeals,
        ];
        for (const deal of candidates) {
            if (!deal) continue;
            const row = deal as unknown as BxRow;
            const id = Number(row.ID);
            if (Number.isFinite(id) && id > 0 && !byId.has(id)) {
                byId.set(id, row);
            }
        }

        const isOpen = (row: BxRow): boolean =>
            this.text(row.CLOSED)?.toUpperCase() !== 'Y';
        const openOf = (categoryId: string | undefined): BxRow[] =>
            categoryId
                ? [...byId.values()]
                      .filter(
                          row =>
                              this.text(row.CATEGORY_ID) === categoryId &&
                              isOpen(row),
                      )
                      .sort((a, b) => Number(a.ID) - Number(b.ID))
                : [];

        const pickMain = (
            linked: BxRow | null,
            open: BxRow[],
        ): BxRow | null => {
            if (linked && isOpen(linked)) return linked;
            return open.length ? open[open.length - 1] : null;
        };

        const baseOpen = openOf(plan.dealCategoryId);
        const xoOpen = openOf(plan.xoCategoryId);
        const mainBase = pickMain(
            ctx.existingOurDeal as unknown as BxRow | null,
            baseOpen,
        );
        const mainXo = pickMain(
            ctx.existingXoDeal as unknown as BxRow | null,
            xoOpen,
        );

        let closed = 0;
        const closeExtras = (
            open: BxRow[],
            main: BxRow | null,
            categoryCode: PbxDealCategoryCodeEnum,
        ): void => {
            const extras = open.filter(
                row => !main || this.text(row.ID) !== this.text(main.ID),
            );
            if (!extras.length) return;
            const failStageId = this.failStageId(categoryCode);
            if (!failStageId) {
                warnings.push(
                    `Fail-стадия воронки ${categoryCode} не сопоставлена — лишние открытые сделки (${extras.length}) не закрыты`,
                );
                return;
            }
            for (const row of extras) {
                const dealId = Number(row.ID);
                const cmd = `lw_close_extra_${item.leadId}_${dealId}`;
                buffer.queue(() =>
                    this.bitrix.batch.deal.update(cmd, dealId, {
                        STAGE_ID: failStageId,
                    } as never),
                );
                closed += 1;
            }
        };
        closeExtras(baseOpen, mainBase, PbxDealCategoryCodeEnum.sales_base);
        closeExtras(xoOpen, mainXo, PbxDealCategoryCodeEnum.sales_xo);
        if (closed > 0) {
            this.logger.log(
                `[consolidate] lead=${item.leadId}: лишних открытых сделок закрыто в fail: ${closed}`,
            );
        }

        return {
            ctx: {
                ...ctx,
                existingOurDeal: mainBase as unknown as
                    | LeadToWorkContext['existingOurDeal']
                    | null,
                existingXoDeal: mainXo as unknown as
                    | LeadToWorkContext['existingXoDeal']
                    | null,
            },
            closed,
            warnings,
        };
    }

    /** `C{cat}:{fail}` по коду воронки; нет fail-стадии в db → null. */
    private failStageId(categoryCode: PbxDealCategoryCodeEnum): string | null {
        const category = this.portal.getDealCategoryByCode(categoryCode);
        if (!category) return null;
        const stage = category.stages.find(st => st.code.endsWith('_fail'));
        return stage ? `C${category.bitrixId}:${stage.bitrixId}` : null;
    }

    private queueCompany(
        item: ResolvedLeadToWorkItem,
        ctx: LeadToWorkContext,
        eventCtx: IXoEventContext | null,
        buffer: IBatchGroupBuffer,
        result: LeadToWorkQueuedPlan,
    ): string | null {
        if (ctx.company) {
            const companyId = String(ctx.company.ID);
            // ХО-ветка «передаёт работу»: компания переходит новому
            // ответственному и получает событийные поля обзвона —
            // как в классическом ХО-хуке.
            if (item.isXo === 'Y') {
                const cmd = `lw_company_upd_${item.leadId}`;
                const fields: BxRow = {
                    ASSIGNED_BY_ID: String(item.responsible),
                    ...this.eventFields(
                        eventCtx,
                        'company',
                        ctx.company as unknown as BxRow,
                    ),
                };
                buffer.queue(() =>
                    this.bitrix.batch.company.update(
                        cmd,
                        Number(companyId),
                        fields as never,
                    ),
                );
            }
            return companyId;
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
                ...this.eventFields(eventCtx, 'company', null),
            } as never),
        );
        result.companyCmd = cmd;
        return `$result[${cmd}]`;
    }

    /**
     * Событийные поля ХО для сущности (общая модель). Контекста нет (не
     * ХО-ветка / нет дедлайна) — пустой объект.
     */
    private eventFields(
        eventCtx: IXoEventContext | null,
        entityType: 'company' | 'deal',
        row: BxRow | null,
    ): BxRow {
        if (!eventCtx) return {};
        return new XoEventEntityModel(
            this.portal,
            entityType,
            row,
            eventCtx,
        ).getFields();
    }

    private queueBaseDeal(
        item: ResolvedLeadToWorkItem,
        ctx: LeadToWorkContext,
        plan: LeadToWorkStagePlan,
        eventName: string,
        companyRef: string | null,
        eventCtx: IXoEventContext | null,
        buffer: IBatchGroupBuffer,
        result: LeadToWorkQueuedPlan,
    ): string {
        if (ctx.existingOurDeal) {
            // Reuse: доводим связи, вторую сделку не создаём (идемпотентность).
            const dealId = String(ctx.existingOurDeal.ID);
            const cmd = `lw_deal_upd_${item.leadId}`;
            const fields: BxRow = {
                ...this.dealLinkFields(
                    item.leadId,
                    ctx.existingOurDeal as unknown as BxRow,
                ),
                ...this.eventFields(
                    eventCtx,
                    'deal',
                    ctx.existingOurDeal as unknown as BxRow,
                ),
            };
            if (
                companyRef &&
                !this.text((ctx.existingOurDeal as unknown as BxRow).COMPANY_ID)
            ) {
                fields.COMPANY_ID = companyRef;
            }
            // Повторный ХО передаёт работу: сделка — новому ответственному.
            if (item.isXo === 'Y') {
                fields.ASSIGNED_BY_ID = String(item.responsible);
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
            ...this.dealLinkFields(item.leadId, null),
            ...this.eventFields(eventCtx, 'deal', null),
        };
        if (plan.dealStageId) fields.STAGE_ID = plan.dealStageId;
        if (companyRef) fields.COMPANY_ID = companyRef;
        const contactId = this.text((ctx.lead as unknown as BxRow).CONTACT_ID);
        if (contactId) fields.CONTACT_ID = contactId;

        buffer.queue(() => this.bitrix.batch.deal.set(cmd, fields as never));
        result.dealCmd = cmd;
        return `$result[${cmd}]`;
    }

    /**
     * Наши поля-связи, обязательные для ЛЮБОЙ связанной сделки (основной И
     * ХО): deal_from_lead_id = лид-первоисточник, deal_joined_leads = union
     * с текущим значением сделки. Отсутствующее на портале поле — скип.
     */
    private dealLinkFields(leadId: number, existingRow: BxRow | null): BxRow {
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
            const current = existingRow
                ? this.refList(existingRow[joinedName])
                : [];
            fields[joinedName] = mergeTaskCrmBindings(current, [`L_${leadId}`]);
        }
        return fields;
    }

    private queueXoDeal(
        item: ResolvedLeadToWorkItem,
        ctx: LeadToWorkContext,
        plan: LeadToWorkStagePlan,
        xoTitle: string,
        companyRef: string | null,
        eventCtx: IXoEventContext | null,
        buffer: IBatchGroupBuffer,
        result: LeadToWorkQueuedPlan,
    ): string | null {
        if (item.isXo !== 'Y') return null;

        // Повторный ХО: существующая ХО-сделка не плодится, а ПЕРЕДАЁТСЯ
        // новому ответственному; связи графа и событийные поля доводятся.
        if (ctx.existingXoDeal) {
            const xoId = String(ctx.existingXoDeal.ID);
            const cmd = `lw_xo_upd_${item.leadId}`;
            const fields: BxRow = {
                ASSIGNED_BY_ID: String(item.responsible),
                ...this.dealLinkFields(
                    item.leadId,
                    ctx.existingXoDeal as unknown as BxRow,
                ),
                ...this.eventFields(
                    eventCtx,
                    'deal',
                    ctx.existingXoDeal as unknown as BxRow,
                ),
            };
            buffer.queue(() =>
                this.bitrix.batch.deal.update(
                    cmd,
                    Number(xoId),
                    fields as never,
                ),
            );
            result.xoCmd = cmd;
            return xoId;
        }

        if (!plan.xoCategoryId) return null;
        const cmd = `lw_xo_${item.leadId}`;
        const fields: BxRow = {
            TITLE: xoTitle,
            CATEGORY_ID: plan.xoCategoryId,
            ASSIGNED_BY_ID: String(item.responsible),
            // Связи графа пишутся и на ХО-сделку (правило пользователя:
            // «у любой связанной сделки — создана из лида/присоединён лид»).
            ...this.dealLinkFields(item.leadId, null),
            // Событийные поля обзвона — как у ХО-сделки классического хука.
            ...this.eventFields(eventCtx, 'deal', null),
        };
        if (plan.xoStageId) fields.STAGE_ID = plan.xoStageId;
        if (companyRef) fields.COMPANY_ID = companyRef;
        buffer.queue(() => this.bitrix.batch.deal.set(cmd, fields as never));
        result.xoCmd = cmd;
        return `$result[${cmd}]`;
    }

    /**
     * Лид: стадия, ответственный и ВЕСЬ пакет полей заявки — считает
     * `LeadXoEventEntityModel` (событийные поля ХО + связи + метки + история).
     * У лида набор шире, чем у компании и сделки, поэтому модель своя.
     */
    private queueLeadUpdate(
        item: ResolvedLeadToWorkItem,
        ctx: LeadToWorkContext,
        plan: LeadToWorkStagePlan,
        dealRef: string,
        xoRef: string | null,
        detection: LeadRequestDetection,
        eventCtx: IXoEventContext | null,
        buffer: IBatchGroupBuffer,
        result: LeadToWorkQueuedPlan,
    ): void {
        const fields: BxRow = {};
        if (plan.leadStatusId) fields.STATUS_ID = plan.leadStatusId;
        // ХО-ветка передаёт работу целиком — лид тоже новому ответственному.
        if (item.isXo === 'Y') {
            fields.ASSIGNED_BY_ID = String(item.responsible);
        }

        const leadRow = ctx.lead as unknown as BxRow;
        // Формат ссылок зависит от привязок КОНКРЕТНОГО поля портала.
        const toBaseName = this.leadFieldName(
            PBX_SALES_EVENT_FIELD_CODES.to_base_sales,
        );
        const toXoName = this.leadFieldName(
            PBX_SALES_EVENT_FIELD_CODES.to_xo_sales,
        );
        const model = new LeadXoEventEntityModel(this.portal, leadRow, {
            eventCtx,
            isRequest: detection.isRequest,
            baseDealRef: toBaseName
                ? this.leadDealRef(toBaseName, dealRef)
                : null,
            xoDealRef:
                toXoName && xoRef ? this.leadDealRef(toXoName, xoRef) : null,
            hasCompany: Boolean(ctx.company || result.companyCmd),
            previousResponsibleId: this.prevResponsible(ctx),
            transferredById: item.transferredBy ?? null,
            timezone: this.portal.getTimezone(),
            responsibleId: item.responsible,
            /*
             * Событийные поля ХО (xo_date, история обзвона, op_work_status…)
             * пишутся ТОЛЬКО в ХО-ветке: конвертация лида в работу холодным
             * обзвоном не является.
             */
            withXoEventFields: item.isXo === 'Y',
        });
        Object.assign(fields, model.getFields());

        this.warnIfLeadFieldsInvisible(item.leadId, fields, result);

        if (Object.keys(fields).length === 0) return;
        const cmd = `lw_lead_${item.leadId}`;
        buffer.queue(() =>
            this.bitrix.batch.lead.update(cmd, item.leadId, fields as never),
        );
    }

    /**
     * Явный сигнал «портал не отдаёт поля лида»: в fields только системные
     * ключи (STATUS_ID/ASSIGNED_BY_ID) — значит ни одно UF-поле лида не
     * разрезолвилось. Практически всегда это устаревший слепок портала
     * (Redis `portal_{domain}`, TTL 10 ч) после установки полей.
     */
    private warnIfLeadFieldsInvisible(
        leadId: number,
        fields: BxRow,
        result: LeadToWorkQueuedPlan,
    ): void {
        const ufKeys = Object.keys(fields).filter(key => key.startsWith('UF_'));
        if (ufKeys.length > 0) return;
        const message =
            `Портал не отдаёт ни одного UF-поля ЛИДА ${leadId} — заполнены ` +
            'только системные поля. Проверьте установку полей лида и сбросьте ' +
            'кэш слепка портала (POST /pbx-portal-cache/invalidate?domain=…)';
        result.warnings.push(message);
        this.logger.warn(`[lead-fields] ${message}`);
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

    private queueTasks(
        item: ResolvedLeadToWorkItem,
        ctx: LeadToWorkContext,
        eventName: string,
        detection: LeadRequestDetection,
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

        const title =
            item.isXo === 'Y'
                ? this.xoTitle(eventName, detection)
                : `${CALL_TASK_PREFIX} ${eventName}`;
        const cmd = `lw_task_add_${item.leadId}`;
        const payload: BxRow = {
            TITLE: title,
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
        eventName: string,
        detection: LeadRequestDetection,
        authorId: number | null,
        companyRef: string | null,
        dealRef: string,
        xoRef: string | null,
        buffer: IBatchGroupBuffer,
        result: LeadToWorkQueuedPlan,
    ): void {
        if (item.isXo !== 'Y') return;

        const refs: ILeadToWorkKpiRefs = {
            leadId: item.leadId,
            companyRef,
            baseDealRef: dealRef,
            xoDealRef: xoRef,
            companyId: ctx.company ? Number(ctx.company.ID) : null,
        };
        const deadline = item.deadline
            ? PortalDeadline.fromPortalInput(
                  item.deadline,
                  this.portal.getTimezone(),
              )
            : null;

        const prev = this.prevResponsible(ctx);
        if (prev && prev !== item.responsible) {
            this.kpi.queueNotHeld(
                {
                    refs,
                    name: eventName,
                    isRequest: detection.isRequest,
                    prevResponsibleId: prev,
                    authorId,
                },
                buffer,
            );
            result.kpiNotHeld = true;
        }

        this.kpi.queuePlanned(
            {
                refs,
                name: eventName,
                isRequest: detection.isRequest,
                responsibleId: item.responsible,
                authorId,
                deadline,
            },
            buffer,
        );
        result.kpiPlanned = true;
    }

    /**
     * Прежний ответственный за обзвон: открытая задача «Холодный обзвон…»
     * → ответственный существующей ХО-сделки → null (первый ХО по лиду).
     */
    private prevResponsible(ctx: LeadToWorkContext): number | null {
        for (const task of ctx.openTasks) {
            const row = task as unknown as BxRow;
            const title = this.text(row.title) ?? this.text(row.TITLE) ?? '';
            if (!title.startsWith(XO_TASK_PREFIX)) continue;
            const id = Number(row.responsibleId ?? row.RESPONSIBLE_ID);
            if (Number.isFinite(id) && id > 0) return id;
        }
        const xo = ctx.existingXoDeal as unknown as BxRow | null;
        if (xo) {
            const id = Number(xo.ASSIGNED_BY_ID);
            if (Number.isFinite(id) && id > 0) return id;
        }
        return null;
    }

    /* ------------------------------------------------------------------ */

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

    /**
     * Значение ссылки на сделку для crm-поля ЛИДА (`to_base_sales`,
     * `to_xo_sales`) в формате, который принимает КОНКРЕТНОЕ поле портала:
     * один разрешённый тип → голый id, несколько → `D_{id}`.
     *
     * Формат берётся из фактических SETTINGS поля (см. buildCrmRefValue):
     * ошибиться нельзя — Битрикс не ругается, а молча не сохраняет значение,
     * и связь остаётся пустой. Определения полей не прочитаны — работает
     * дефолт с префиксом (инсталлер по умолчанию включает все типы).
     */
    private leadDealRef(ufName: string, ref: string): string {
        return buildCrmRefValue(
            this.ufDefinitions[ufName]?.crmTypes ?? [],
            'DEAL',
            ref,
        );
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
