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
import { EventSalesFlowDto } from '../../../dto/event-sale-flow/event-sales-flow.dto';
import {
    EventReportEntityType,
    IEventReportInitContext,
} from './event-report-init.types';

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
                'EventReportInit: cannot resolve entityId from placement/lead/contact',
            );
        }

        // === Фаза 1: company/lead + active deals + task + DTO lead ===
        if (entityType === 'company') {
            bitrix.batch.company.get('get_company', entityId);
            this.queueActiveDealsLoad(bitrix, entityId, 'company');
        } else {
            bitrix.batch.lead.get('get_lead_entity', entityId);
            this.queueActiveDealsLoad(bitrix, entityId, 'lead');
        }

        const dtoLeadId = dto.lead?.ID ? Number(dto.lead.ID) : null;
        if (dtoLeadId && entityType !== 'lead') {
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
            entityType === 'company'
                ? this.pick<IBXCompany>(flat, 'get_company')
                : null;
        const entityLead =
            entityType === 'lead'
                ? this.pick<IBXLead>(flat, 'get_lead_entity')
                : null;
        const dtoLead = dtoLeadId
            ? this.pick<IBXLead>(flat, 'get_dto_lead')
            : null;
        const lead = entityLead ?? dtoLead;

        const dealsRaw = this.pick<IBXDeal[]>(flat, 'list_deals') ?? [];

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
        const placement = dto.placement?.placement ?? '';
        const placementOptId = dto.placement?.options?.ID
            ? Number(dto.placement.options.ID)
            : null;

        // CALL_CARD → company по CRM_BINDINGS (placement.options.ID); если нет — lead из DTO
        if (placement.includes('LEAD')) {
            const leadId = dto.lead?.ID ? Number(dto.lead.ID) : placementOptId;
            return { entityId: leadId ?? 0, entityType: 'lead' };
        }

        const companyId = placementOptId ?? null;
        if (companyId) {
            return { entityId: companyId, entityType: 'company' };
        }
        // fallback на lead
        const leadId = dto.lead?.ID ? Number(dto.lead.ID) : 0;
        return { entityId: leadId, entityType: 'lead' };
    }

    /**
     * Грузит все активные сделки по entity. Фильтр '!=STAGE_ID' с массивом
     * стадий-конечников — для базовой воронки sales_base WON/LOSE; для других
     * категорий полагаемся на потребителя (мы фильтруем по category после).
     */
    private queueActiveDealsLoad(
        bitrix: BitrixService,
        entityId: number,
        entityType: EventReportEntityType,
    ): void {
        const select = [
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
        const filter: Partial<IBXDeal> = {};
        if (entityType === 'company') {
            (filter as Record<string, unknown>).COMPANY_ID = entityId;
        } else {
            (filter as Record<string, unknown>).LEAD_ID = entityId;
        }
        bitrix.batch.deal.getList('list_deals', filter, select);
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
