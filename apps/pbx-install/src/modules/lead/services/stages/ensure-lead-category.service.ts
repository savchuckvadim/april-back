import { Injectable, NotFoundException } from '@nestjs/common';
import {
    BtxCategoryService,
    PortalLeadService,
} from '@lib/portal-lib/pbx-domain';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PbxEntityType } from '@/shared';
import { PbxEntityGroupEnum } from '../../../shared/entity/field/parse-entity-field.service';

export interface LeadCategoryAnchor {
    leadId: number;
    categoryId: number;
}

/**
 * Гарантирует наличие в PortalDB единственной категории лида — якоря для `btx_stages`.
 *
 * У лида в Bitrix воронок нет, поэтому в Bitrix ничего НЕ создаётся: категория существует
 * только в PortalDB (`btx_categories`, `entity_type = LEAD`) и служит привязкой для стадий.
 */
@Injectable()
export class EnsureLeadCategoryService {
    constructor(
        private readonly portalService: PortalStoreService,
        private readonly portalLeadService: PortalLeadService,
        private readonly categoryService: BtxCategoryService,
    ) {}

    /** Найти/создать лид-якорь и его единственную категорию. */
    async ensure(
        domain: string,
        group: PbxEntityGroupEnum,
    ): Promise<LeadCategoryAnchor> {
        const leadId = await this.ensureLead(domain);

        const existing = await this.categoryService.findByEntity(
            PbxEntityType.LEAD,
            leadId,
        );
        if (existing.length > 0) {
            return { leadId, categoryId: existing[0].id };
        }

        const created = await this.categoryService.create({
            entity_type: PbxEntityType.LEAD,
            entity_id: leadId,
            parent_type: 'lead',
            type: 'lead',
            group,
            title: 'Лиды',
            name: 'lead',
            bitrixId: '',
            bitrixCamelId: '',
            code: `lead_${group}`,
            isActive: true,
        });
        return { leadId, categoryId: created.id };
    }

    /** Найти лид-якорь и его категорию без создания (для мониторинга). */
    async find(domain: string): Promise<LeadCategoryAnchor | null> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            return null;
        }
        const lead = await this.portalLeadService.findByPortalId(
            Number(portal.id),
        );
        if (!lead) {
            return null;
        }
        const cats = await this.categoryService.findByEntity(
            PbxEntityType.LEAD,
            lead.id,
        );
        if (cats.length === 0) {
            return null;
        }
        return { leadId: lead.id, categoryId: cats[0].id };
    }

    private async ensureLead(domain: string): Promise<number> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const portalId = Number(portal.id);
        let lead = await this.portalLeadService.findByPortalId(portalId);
        if (!lead) {
            lead = await this.portalLeadService.create({
                code: `lead_${domain}`,
                name: 'lead',
                title: 'lead',
                portalId,
            });
        }
        return lead.id;
    }
}
