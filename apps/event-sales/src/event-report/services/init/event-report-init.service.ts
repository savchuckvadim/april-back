import { Injectable, Logger } from '@nestjs/common';
import {
    BitrixService,
    IBXCompany,
    IBXContact,
    IBXDeal,
    IBXLead,
} from '@/modules/bitrix';
import { IBXTask } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { EventSalesFlowDto } from '../../dto/event-sale-flow/event-sales-flow.dto';
import {
    EEventReportEntityType,
    EventReportEntityType,
    IEventReportInitContext,
} from './event-report-init.types';

/** SELECT сделок init-батча (общий для list_deals и list_deals_by_lead). */
const DEAL_LIST_SELECT = [
    'ID',
    'TITLE',
    'CATEGORY_ID',
    'STAGE_ID',
    'CLOSED',
    'COMPANY_ID',
    'CONTACT_ID',
    'LEAD_ID',
    'ASSIGNED_BY_ID',
    'UF_CRM_TO_BASE_SALES',
    'UF_CRM_TO_PRESENTATION_SALES',
    'UF_CRM_TO_BASE_TMC',
];

/**
 * Коды pbx-полей сделки со связанными лидами (тот же набор, что в
 * pbx-duplicate/related-entities): стандартный LEAD_ID читается всегда,
 * эти — по слепку портала, когда проинсталлены.
 */
const DEAL_LEAD_LINK_FIELD_CODES = [
    'deal_from_lead_id',
    'deal_joined_leads',
    'op_smart_lid',
    'op_smart_lids',
] as const;

/** UF-ключи to_*-ссылок владельца на сделки других воронок (install-конвенция). */
const OWNER_DEAL_LINK_KEYS = [
    'UF_CRM_TO_BASE_SALES',
    'UF_CRM_TO_XO_SALES',
    'UF_CRM_TO_PRESENTATION_SALES',
    'UF_CRM_TO_BASE_TMC',
] as const;

/**
 * Загружает все нужные event-report flow сущности одним HTTP-batch:
 *  - company (по entityId компании),
 *  - все её активные deals по 4 категориям,
 *  - lead (если связан),
 *  - currentTask (если был отчёт по задаче),
 *  - tmcDeal через UF_CRM_TO_PRESENTATION_SALES (для синхронизации с pres).
 *
 * Возвращает {@link IEventReportInitContext} — снимок состояния, на котором
 * дальше работает {@link EventReportContext} (вычисляет флаги).
 *
 * NB: @Injectable, но не держит `this.bitrix` — инстанс передаётся параметром
 * (см. CLAUDE.md race condition).
 */
@Injectable()
export class EventReportInitService {
    private readonly logger = new Logger(EventReportInitService.name);

    async loadContext(
        dto: EventSalesFlowDto,
        bitrix: BitrixService,
        portal: PortalModel,
    ): Promise<IEventReportInitContext> {
        const { entityId, entityType } = this.resolveEntity(dto);
        if (!entityId) {
            throw new Error(
                'EventReportInit: cannot resolve entityId from context/placement/lead',
            );
        }

        // Владелец-сделка читается ДО общего батча: из её полей строится
        // остальная загрузка — лиды (LEAD_ID + deal_from_lead_id +
        // deal_joined_leads), связанные воронки (to_*-ссылки) и сделки тех
        // же лидов (там живёт ХО без компании).
        const ownerDeal =
            entityType === EEventReportEntityType.DEAL
                ? await this.fetchOwnerDeal(bitrix, entityId)
                : null;
        const ownerLeadIds = this.collectOwnerLeadIds(ownerDeal, portal);

        const dtoLeadId = dto.lead?.ID ? Number(dto.lead.ID) : null;

        // === Фаза 1: владелец (company/lead/deal) + active deals + task + DTO lead ===
        if (entityType === EEventReportEntityType.COMPANY) {
            bitrix.batch.company.get('get_company', entityId);
            this.queueActiveDealsLoad(bitrix, entityId, entityType);
        } else if (entityType === EEventReportEntityType.DEAL) {
            // У владельца-сделки нет «всех сделок компании» — добираем по
            // D_-ссылкам задачи (pres/tmc), to_*-ссылкам самой сделки и по
            // общим лидам, иначе отчёт создал бы дубли вместо обновления.
            this.queueActiveDealsLoad(bitrix, entityId, entityType, [
                ...this.extractTaskDealIds(dto),
                ...this.collectOwnerLinkedDealIds(ownerDeal),
            ]);
            if (ownerLeadIds.length) {
                bitrix.batch.deal.getList(
                    'list_deals_by_lead',
                    { LEAD_ID: ownerLeadIds } as never,
                    DEAL_LIST_SELECT,
                );
            }
            const primaryLeadId = ownerLeadIds[0];
            if (primaryLeadId && primaryLeadId !== dtoLeadId) {
                bitrix.batch.lead.get('get_owner_lead', primaryLeadId);
            }
        } else {
            bitrix.batch.lead.get('get_lead_entity', entityId);
            this.queueActiveDealsLoad(bitrix, entityId, entityType);
        }

        if (dtoLeadId && entityType !== EEventReportEntityType.LEAD) {
            bitrix.batch.lead.get('get_dto_lead', dtoLeadId);
        }

        // currentTask грузить из Bitrix не нужно — фронт уже передал
        // полное содержимое в DTO (включая ufCrmTask в camelCase).
        const reportContactId = dto.report?.contact?.ID
            ? Number(dto.report.contact.ID)
            : null;
        if (reportContactId) {
            bitrix.batch.contact.get('get_report_contact', reportContactId);
        }
        const planContactId = dto.plan?.contact?.ID
            ? Number(dto.plan.contact.ID)
            : null;
        if (planContactId && planContactId !== reportContactId) {
            bitrix.batch.contact.get('get_plan_contact', planContactId);
        }

        const batchResults = await bitrix.api.callBatchWithConcurrency(1);
        const flat = this.flattenResults(batchResults);

        const company =
            entityType === EEventReportEntityType.COMPANY
                ? this.pick<IBXCompany>(flat, 'get_company')
                : null;
        const entityLead =
            entityType === EEventReportEntityType.LEAD
                ? this.pick<IBXLead>(flat, 'get_lead_entity')
                : null;
        const dtoLead = dtoLeadId
            ? this.pick<IBXLead>(flat, 'get_dto_lead')
            : null;
        const ownerDealLead = this.pick<IBXLead>(flat, 'get_owner_lead');
        const lead = entityLead ?? dtoLead ?? ownerDealLead;

        const dealsRaw = this.dedupeDealsById([
            ...(this.pick<IBXDeal[]>(flat, 'list_deals') ?? []),
            ...(this.pick<IBXDeal[]>(flat, 'list_deals_by_lead') ?? []),
        ]);

        const currentTask = (dto.currentTask ??
            null) as unknown as IBXTask | null;

        const reportContact = reportContactId
            ? this.pick<IBXContact>(flat, 'get_report_contact')
            : null;
        const planContact = planContactId
            ? (this.pick<IBXContact>(flat, 'get_plan_contact') ?? reportContact)
            : null;

        // === Фаза 2: распределить deals по категориям ===
        const activeDeals = this.filterActiveDeals(dealsRaw);
        const dealsByCategory = this.groupDealsByCategory(activeDeals, portal);
        const currentBaseDeal =
            dealsByCategory[PbxDealCategoryCodeEnum.sales_base] ?? null;
        const currentXoDeal =
            dealsByCategory[PbxDealCategoryCodeEnum.sales_xo] ?? null;

        // === Фаза 3: presDeal/tmcDeal — по dealIds из dto.currentTask.ufCrmTask ===
        const taskCrmLinks = this.extractTaskCrmLinks(dto);
        const { currentPresDeal, currentTmcDeal } = this.resolveTaskLinkedDeals(
            taskCrmLinks,
            activeDeals,
            portal,
        );

        const currentTmcFromPresentation = this.resolveTmcLinkedToPresentation(
            currentPresDeal,
            dealsRaw,
        );

        return {
            entityId,
            entityType,
            company,
            lead,
            ownerDeal,
            currentBaseDeal,
            currentXoDeal,
            currentPresDeal,
            currentTmcDeal,
            currentTmcFromPresentation,
            currentTask,
            reportContact,
            planContact,
        };
    }

    private resolveEntity(dto: EventSalesFlowDto): {
        entityId: number;
        entityType: EventReportEntityType;
    } {
        // Приоритет — честный контекст. Компания остаётся самым широким
        // контекстом (даже когда открылись из сделки или задачи), сделка без
        // компании — легальный владелец, чистый лид — последним.
        const ctx = dto.context;
        if (ctx) {
            const companyId = this.toId(ctx.companyId);
            if (companyId) {
                return {
                    entityId: companyId,
                    entityType: EEventReportEntityType.COMPANY,
                };
            }
            const dealId = this.toId(ctx.dealId);
            if (dealId) {
                return {
                    entityId: dealId,
                    entityType: EEventReportEntityType.DEAL,
                };
            }
            const leadId = this.toId(ctx.leadId);
            if (leadId) {
                return {
                    entityId: leadId,
                    entityType: EEventReportEntityType.LEAD,
                };
            }
            // context прислан пустым — падаем в legacy-ветку, не в ошибку.
        }

        // Legacy-фолбэк: старые клиенты шлют placement, причём для
        // deal/task/call_card он подделан под CRM_COMPANY_DETAIL_TAB с
        // companyId в options.ID — поэтому «не LEAD → company».
        const placement = dto.placement?.placement ?? '';
        const placementOptId = dto.placement?.options?.ID
            ? Number(dto.placement.options.ID)
            : null;

        if (placement.includes('LEAD')) {
            const leadId = dto.lead?.ID ? Number(dto.lead.ID) : placementOptId;
            return {
                entityId: leadId ?? 0,
                entityType: EEventReportEntityType.LEAD,
            };
        }

        const companyId = placementOptId ?? null;
        if (companyId) {
            return {
                entityId: companyId,
                entityType: EEventReportEntityType.COMPANY,
            };
        }
        // fallback на lead
        const leadId = dto.lead?.ID ? Number(dto.lead.ID) : 0;
        return { entityId: leadId, entityType: EEventReportEntityType.LEAD };
    }

    private toId(value: number | undefined): number | null {
        const id = Number(value);
        return Number.isFinite(id) && id > 0 ? id : null;
    }

    /**
     * Сделка-владелец читается до общего батча: из её полей строится
     * остальная загрузка. Ошибка не роняет отчёт — контекст соберётся из
     * DTO (warning в лог, сущность недогружена).
     */
    private async fetchOwnerDeal(
        bitrix: BitrixService,
        dealId: number,
    ): Promise<IBXDeal | null> {
        try {
            // callType отдаёт обёртку IBitrixResponse — сущность в .result.
            const response = await bitrix.deal.get(dealId);
            return response?.result ?? null;
        } catch (error) {
            this.logger.warn(
                `owner deal load failed: deal ${dealId}: ${String(error)}`,
            );
            return null;
        }
    }

    /**
     * Все лиды сделки-владельца: стандартный `LEAD_ID` + наши поля связей
     * (`deal_from_lead_id`, `deal_joined_leads`, legacy `op_smart_lid(s)`),
     * резолвленные по слепку портала. Значения принимаются и как `L_12`,
     * и как голый id; поле не проинсталлено — просто пропускается.
     */
    private collectOwnerLeadIds(
        ownerDeal: IBXDeal | null,
        portal: PortalModel,
    ): number[] {
        if (!ownerDeal) return [];
        const raw = ownerDeal as unknown as Record<string, unknown>;
        const ids = new Set<number>();
        const primary = this.toId(Number(raw['LEAD_ID']));
        if (primary) ids.add(primary);

        for (const code of DEAL_LEAD_LINK_FIELD_CODES) {
            const field = portal.getEntityFieldByCode('deal', code);
            if (!field?.bitrixId) continue;
            const value = raw[`UF_CRM_${field.bitrixId}`];
            const values = Array.isArray(value)
                ? value
                : value !== null && value !== undefined
                  ? [value]
                  : [];
            for (const item of values) {
                const text = String(item ?? '').trim();
                const id = this.toId(
                    Number(/^L_/i.test(text) ? text.slice(2) : text),
                );
                if (id) ids.add(id);
            }
        }
        return [...ids];
    }

    /** Сделки, на которые владелец ссылается через to_*-поля воронок. */
    private collectOwnerLinkedDealIds(ownerDeal: IBXDeal | null): number[] {
        if (!ownerDeal) return [];
        const raw = ownerDeal as unknown as Record<string, unknown>;
        const ids = new Set<number>();
        for (const key of OWNER_DEAL_LINK_KEYS) {
            const id = this.toId(Number(raw[key]));
            if (id) ids.add(id);
        }
        return [...ids];
    }

    private dedupeDealsById(deals: IBXDeal[]): IBXDeal[] {
        const seen = new Set<string>();
        return deals.filter(deal => {
            const id = String(deal?.ID ?? '');
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }

    /** ID сделок из D_-ссылок задачи DTO (для владельца-сделки). */
    private extractTaskDealIds(dto: EventSalesFlowDto): number[] {
        return this.extractTaskCrmLinks(dto)
            .filter(value => value.startsWith('D_'))
            .map(value => Number(value.slice(2)))
            .filter(id => Number.isFinite(id) && id > 0);
    }

    /**
     * Грузит все активные сделки по entity: company — все сделки компании,
     * deal — владелец + переданные extraDealIds (ссылки задачи и to_*-полей),
     * lead — сделки лида. Закрытые отсекает `filterActiveDeals` после.
     */
    private queueActiveDealsLoad(
        bitrix: BitrixService,
        entityId: number,
        entityType: EventReportEntityType,
        extraDealIds: number[] = [],
    ): void {
        const filter: Partial<IBXDeal> = {};
        if (entityType === EEventReportEntityType.COMPANY) {
            (filter as Record<string, unknown>).COMPANY_ID = entityId;
        } else if (entityType === EEventReportEntityType.DEAL) {
            // Массив в значении фильтра = IN.
            (filter as Record<string, unknown>).ID = [
                entityId,
                ...extraDealIds.filter(id => id !== entityId),
            ];
        } else {
            (filter as Record<string, unknown>).LEAD_ID = entityId;
        }
        bitrix.batch.deal.getList('list_deals', filter, DEAL_LIST_SELECT);
    }

    private flattenResults(
        batchResults: IBitrixBatchResponseResult[],
    ): Record<string, unknown> {
        const flat: Record<string, unknown> = {};
        for (const chunk of batchResults) {
            for (const key in chunk.result) {
                flat[key] = chunk.result[key];
            }
        }
        return flat;
    }

    private pick<T>(flat: Record<string, unknown>, key: string): T | null {
        const value = flat[key];
        return value === undefined ? null : (value as T);
    }

    /**
     * Активные сделки = `CLOSED ≠ 'Y'`. Поле приходит из crm.deal.list даже
     * без явного select — фильтруем здесь, чтобы не зависеть от того, что
     * Bitrix положил в CATEGORY_ID для закрытых.
     */
    private filterActiveDeals(deals: IBXDeal[]): IBXDeal[] {
        return deals.filter(deal => {
            const closed = (deal as Record<string, unknown>)['CLOSED'];
            return closed !== 'Y' && closed !== true;
        });
    }

    private groupDealsByCategory(
        deals: IBXDeal[],
        portal: PortalModel,
    ): Partial<Record<PbxDealCategoryCodeEnum, IBXDeal>> {
        const result: Partial<Record<PbxDealCategoryCodeEnum, IBXDeal>> = {};
        const categories = portal.getDealCategories();
        for (const deal of deals) {
            const category = categories.find(
                c => String(c.bitrixId) === String(deal.CATEGORY_ID),
            );
            if (!category) continue;
            const code = category.code as PbxDealCategoryCodeEnum;
            if (!result[code]) {
                result[code] = deal;
            }
        }
        return result;
    }

    /**
     * Достаёт массив CRM-связей задачи (`D_*`, `C_*`, `CO_*`, `L_*`) из DTO.
     * Фронт уже передал `ufCrmTask` в camelCase; альтернативное поле
     * `UF_CRM_TASK` (snake_case) поддерживаем на всякий случай.
     */
    private extractTaskCrmLinks(dto: EventSalesFlowDto): string[] {
        const t = dto.currentTask as
            | undefined
            | (Record<string, unknown> & { ufCrmTask?: unknown });
        if (!t) return [];
        const raw = t.ufCrmTask ?? t['UF_CRM_TASK'];
        if (!Array.isArray(raw)) return [];
        return raw.filter((v): v is string => typeof v === 'string');
    }

    /**
     * Находит pres/tmc сделки, связанные с задачей. Берём dealIds из ufCrmTask
     * задачи и матчим их со сделками компании по категории — это надёжнее, чем
     * «первая активная сделка категории», когда у компании несколько сделок
     * одной воронки.
     */
    private resolveTaskLinkedDeals(
        taskCrmLinks: string[],
        activeDeals: IBXDeal[],
        portal: PortalModel,
    ): {
        currentPresDeal: IBXDeal | null;
        currentTmcDeal: IBXDeal | null;
    } {
        const dealIds = new Set(
            taskCrmLinks.filter(v => v.startsWith('D_')).map(v => v.slice(2)),
        );
        if (dealIds.size === 0) {
            return { currentPresDeal: null, currentTmcDeal: null };
        }
        const presCategory = portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_presentation,
        );
        const tmcCategory = portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.tmc_base,
        );

        const findInCategory = (
            categoryBitrixId: number | string | undefined,
        ): IBXDeal | null => {
            if (!categoryBitrixId) return null;
            const target = String(categoryBitrixId);
            return (
                activeDeals.find(
                    d =>
                        dealIds.has(String(d.ID)) &&
                        String(d.CATEGORY_ID) === target,
                ) ?? null
            );
        };

        return {
            currentPresDeal: findInCategory(presCategory?.bitrixId),
            currentTmcDeal: findInCategory(tmcCategory?.bitrixId),
        };
    }

    private resolveTmcLinkedToPresentation(
        presDeal: IBXDeal | null,
        allDeals: IBXDeal[],
    ): IBXDeal | null {
        if (!presDeal) return null;
        const presId = String(presDeal.ID);
        return (
            allDeals.find(d => {
                const raw = (d as Record<string, unknown>)[
                    'UF_CRM_TO_PRESENTATION_SALES'
                ];
                if (typeof raw !== 'string' && typeof raw !== 'number') {
                    return false;
                }
                return String(raw) === presId;
            }) ?? null
        );
    }
}
