import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import {
    IPCategory,
    IStage,
} from '@lib/portal-lib/portal/interfaces/portal.interface';
import { DuplicateEntityType } from '../type/duplicate.type';
import {
    HIDDEN_STAGE_BITRIX_IDS,
    RelatedDeal,
    RelatedEntitiesOptions,
    RelatedEntitiesResult,
    RelatedLead,
    RelatedStage,
    ResponsibleUser,
} from '../type/related.type';
import { ResponsibleService } from './responsible.service';

type BitrixInstance = Awaited<ReturnType<PBXService['init']>>['bitrix'];
type BxRow = Record<string, unknown>;

const DEAL_SELECT = [
    'ID',
    'TITLE',
    'STAGE_ID',
    'CATEGORY_ID',
    'ASSIGNED_BY_ID',
    'OPPORTUNITY',
    'CLOSED',
    'DATE_CREATE',
];

const LEAD_SELECT = [
    'ID',
    'TITLE',
    'STATUS_ID',
    'STATUS_SEMANTIC_ID',
    'ASSIGNED_BY_ID',
    'DATE_CREATE',
];

/**
 * Что уже происходит с найденным контрагентом: наши сделки и лиды по нему,
 * с человеческой стадией и ответственным.
 *
 * Стадии не хардкодятся: их коды, названия, порядок и цвета берутся из
 * PortalModel — то есть из настроек конкретного портала. Поэтому «узкая
 * разноцветная полоска» на фронте рисуется теми же цветами, что менеджер
 * видит в своей воронке.
 */
@Injectable()
export class RelatedEntitiesService {
    private readonly logger = new Logger(RelatedEntitiesService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly responsible: ResponsibleService,
    ) {}

    async getRelated(
        domain: string,
        entityType: DuplicateEntityType,
        entityId: number,
        options: RelatedEntitiesOptions = {},
    ): Promise<RelatedEntitiesResult> {
        const warnings: string[] = [];
        const { bitrix, PortalModel: portalModel } = await this.pbx.init(domain);

        const anchor = await this.resolveAnchor(
            bitrix,
            entityType,
            entityId,
            warnings,
        );
        let requests = anchor.requests;

        const { deals, leads } = await this.fetchRelated(
            bitrix,
            anchor,
            options,
            warnings,
        );
        requests += 1;

        const stageIndex = this.buildStageIndex(portalModel);
        const visibleDeals = deals.filter(deal =>
            this.isVisibleStage(String(deal.STAGE_ID ?? '')),
        );

        const responsibleIds = [
            ...visibleDeals.map(row => Number(row.ASSIGNED_BY_ID)),
            ...leads.map(row => Number(row.ASSIGNED_BY_ID)),
        ];
        const people = await this.responsible.resolve(bitrix, responsibleIds);
        requests += responsibleIds.length ? 2 : 0;

        return {
            entityType,
            entityId,
            responsible: this.anchorResponsible(anchor, people),
            deals: visibleDeals.map(row => this.toDeal(row, stageIndex, people)),
            leads: leads.map(row => this.toLead(row, people)),
            batchRequests: requests,
            warnings,
        };
    }

    /* ------------------------------------------------------------------ *
     * От кого пляшем
     * ------------------------------------------------------------------ */

    /**
     * Сделка сама по себе не «контрагент»: связанные сделки ищутся по её
     * компании или контакту. Поэтому для DEAL сначала читаем саму сделку.
     */
    private async resolveAnchor(
        bitrix: BitrixInstance,
        entityType: DuplicateEntityType,
        entityId: number,
        warnings: string[],
    ): Promise<{
        companyId?: number;
        contactId?: number;
        leadId?: number;
        assignedById?: number;
        requests: number;
    }> {
        if (entityType === DuplicateEntityType.COMPANY) {
            return { companyId: entityId, requests: 0 };
        }
        if (entityType === DuplicateEntityType.CONTACT) {
            return { contactId: entityId, requests: 0 };
        }
        if (entityType === DuplicateEntityType.LEAD) {
            return { leadId: entityId, requests: 0 };
        }

        try {
            const response = (await bitrix.api.call('crm.deal.get', {
                id: entityId,
            })) as { result?: BxRow } | BxRow;
            const deal = (
                (response as { result?: BxRow })?.result ?? response
            ) as BxRow;

            return {
                companyId: this.id(deal?.COMPANY_ID),
                contactId: this.id(deal?.CONTACT_ID),
                assignedById: this.id(deal?.ASSIGNED_BY_ID),
                requests: 1,
            };
        } catch (error) {
            warnings.push(`Не удалось прочитать сделку: ${this.errorText(error)}`);
            return { requests: 1 };
        }
    }

    private anchorResponsible(
        anchor: { assignedById?: number },
        people: Map<number, ResponsibleUser>,
    ): ResponsibleUser | undefined {
        return anchor.assignedById ? people.get(anchor.assignedById) : undefined;
    }

    /* ------------------------------------------------------------------ *
     * Запрос связанных
     * ------------------------------------------------------------------ */

    private async fetchRelated(
        bitrix: BitrixInstance,
        anchor: { companyId?: number; contactId?: number; leadId?: number },
        options: RelatedEntitiesOptions,
        warnings: string[],
    ): Promise<{ deals: BxRow[]; leads: BxRow[] }> {
        const dealFilter: Record<string, unknown> = {};
        const leadFilter: Record<string, unknown> = {};

        if (anchor.companyId) {
            dealFilter.COMPANY_ID = anchor.companyId;
            leadFilter.COMPANY_ID = anchor.companyId;
        }
        if (anchor.contactId) {
            dealFilter.CONTACT_ID = anchor.contactId;
            leadFilter.CONTACT_ID = anchor.contactId;
        }
        if (anchor.leadId) {
            dealFilter.LEAD_ID = anchor.leadId;
        }
        if (!options.includeClosed) {
            dealFilter.CLOSED = 'N';
        }

        const hasDealFilter = Object.keys(dealFilter).some(
            key => key !== 'CLOSED',
        );
        const hasLeadFilter = Object.keys(leadFilter).length > 0;

        if (hasDealFilter) {
            bitrix.api.addCmdBatch('deals', 'crm.deal.list', {
                filter: dealFilter,
                select: DEAL_SELECT,
                order: { ID: 'DESC' },
                start: -1,
            });
        }
        if (hasLeadFilter) {
            bitrix.api.addCmdBatch('leads', 'crm.lead.list', {
                filter: leadFilter,
                select: LEAD_SELECT,
                order: { ID: 'DESC' },
                start: -1,
            });
        }
        if (!hasDealFilter && !hasLeadFilter) {
            return { deals: [], leads: [] };
        }

        try {
            const chunks = await bitrix.api.callBatchAsync();
            const byCmd = new Map<string, unknown>();
            for (const chunk of chunks) {
                const rows = (chunk?.result ?? {}) as Record<string, unknown>;
                for (const [cmd, value] of Object.entries(rows)) {
                    byCmd.set(cmd, value);
                }
            }
            return {
                deals: this.rowsOf(byCmd.get('deals')),
                leads: this.rowsOf(byCmd.get('leads')),
            };
        } catch (error) {
            warnings.push(
                `Не удалось получить связанные сущности: ${this.errorText(error)}`,
            );
            return { deals: [], leads: [] };
        }
    }

    /* ------------------------------------------------------------------ *
     * Стадии из PortalModel
     * ------------------------------------------------------------------ */

    /**
     * `C{categoryBitrixId}:{stageBitrixId}` → описание стадии. Ровно так
     * Битрикс склеивает STAGE_ID сделки (см. ColdPortalDealModel в event-sales).
     */
    private buildStageIndex(
        portalModel: Awaited<ReturnType<PBXService['init']>>['PortalModel'],
    ): Map<string, RelatedStage> {
        const index = new Map<string, RelatedStage>();

        let categories: IPCategory[] = [];
        try {
            categories = portalModel?.getDealCategories?.() ?? [];
        } catch (error) {
            this.logger.warn(
                `Воронки портала недоступны: ${this.errorText(error)}`,
            );
            return index;
        }

        for (const category of categories) {
            const stages: IStage[] = category.stages ?? [];
            stages.forEach((stage, position) => {
                const bitrixId = `C${category.bitrixId}:${stage.bitrixId}`;
                index.set(bitrixId, {
                    bitrixId,
                    code: stage.code,
                    title: stage.title || stage.name,
                    color: stage.color,
                    categoryCode: category.code,
                    categoryTitle: category.title || category.name,
                    order: position,
                    total: stages.length,
                });
            });
        }
        return index;
    }

    /** APOLOGY — техническая стадия, менеджеру показывать нечего. */
    private isVisibleStage(stageId: string): boolean {
        const suffix = stageId.includes(':')
            ? stageId.split(':').slice(1).join(':')
            : stageId;
        return !HIDDEN_STAGE_BITRIX_IDS.includes(suffix);
    }

    /* ------------------------------------------------------------------ *
     * Маппинг строк
     * ------------------------------------------------------------------ */

    private toDeal(
        row: BxRow,
        stageIndex: Map<string, RelatedStage>,
        people: Map<number, ResponsibleUser>,
    ): RelatedDeal {
        const stageId = String(row.STAGE_ID ?? '');
        const assignedId = this.id(row.ASSIGNED_BY_ID);

        return {
            id: Number(row.ID),
            title: String(row.TITLE ?? '').trim() || `Сделка ${row.ID}`,
            stage: stageIndex.get(stageId) ?? { bitrixId: stageId },
            responsible: assignedId ? people.get(assignedId) : undefined,
            opportunity: row.OPPORTUNITY ? Number(row.OPPORTUNITY) : undefined,
            closed: String(row.CLOSED ?? 'N') === 'Y',
            dateCreate: row.DATE_CREATE ? String(row.DATE_CREATE) : undefined,
        };
    }

    private toLead(
        row: BxRow,
        people: Map<number, ResponsibleUser>,
    ): RelatedLead {
        const assignedId = this.id(row.ASSIGNED_BY_ID);

        return {
            id: Number(row.ID),
            title: String(row.TITLE ?? '').trim() || `Лид ${row.ID}`,
            statusId: row.STATUS_ID ? String(row.STATUS_ID) : undefined,
            statusSemanticId: row.STATUS_SEMANTIC_ID
                ? String(row.STATUS_SEMANTIC_ID)
                : undefined,
            responsible: assignedId ? people.get(assignedId) : undefined,
            dateCreate: row.DATE_CREATE ? String(row.DATE_CREATE) : undefined,
        };
    }

    private rowsOf(raw: unknown): BxRow[] {
        if (Array.isArray(raw)) return raw as BxRow[];
        if (raw && typeof raw === 'object') {
            const container = raw as { items?: unknown; result?: unknown };
            if (Array.isArray(container.items)) return container.items as BxRow[];
            if (Array.isArray(container.result)) {
                return container.result as BxRow[];
            }
        }
        return [];
    }

    private id(raw: unknown): number | undefined {
        const value = Number(raw);
        return Number.isFinite(value) && value > 0 ? value : undefined;
    }

    private errorText(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
