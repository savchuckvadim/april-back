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

    /**
     * Найти/создать лид-якорь и категорию ЕГО ГРУППЫ.
     *
     * Раньше бралась existing[0] без учёта группы — маппинги SALES и
     * SERVICE (у них одинаковые коды стадий) затирали друг друга.
     * Теперь: ищем по group, затем по code `lead_{group}`; единственную
     * legacy-строку без группы «усыновляем» (проставляем group/code);
     * иначе создаём новую категорию группы.
     */
    async ensure(
        domain: string,
        group: PbxEntityGroupEnum,
    ): Promise<LeadCategoryAnchor> {
        const leadId = await this.ensureLead(domain);

        const existing = await this.categoryService.findByEntity(
            PbxEntityType.LEAD,
            leadId,
        );
        const matched = this.matchByGroup(existing, group);
        if (matched) {
            return { leadId, categoryId: matched.id };
        }

        const orphan =
            existing.length === 1 && !existing[0].group ? existing[0] : null;
        if (orphan) {
            await this.categoryService.update(orphan.id, {
                group,
                code: `lead_${group}`,
            });
            return { leadId, categoryId: orphan.id };
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

    /** Найти лид-якорь и категорию группы без создания (для мониторинга). */
    async find(
        domain: string,
        group?: PbxEntityGroupEnum,
    ): Promise<LeadCategoryAnchor | null> {
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
        if (!group) {
            return { leadId: lead.id, categoryId: cats[0].id };
        }
        const matched = this.matchByGroup(cats, group);
        // Fallback на единственную legacy-строку без группы — чтобы
        // мониторинг видел старое сопоставление до первого ensure().
        const fallback =
            !matched && cats.length === 1 && !cats[0].group ? cats[0] : null;
        const target = matched ?? fallback;
        return target ? { leadId: lead.id, categoryId: target.id } : null;
    }

    private matchByGroup<T extends { group: string; code: string }>(
        categories: T[],
        group: PbxEntityGroupEnum,
    ): T | undefined {
        return (
            categories.find(category => category.group === (group as string)) ??
            categories.find(category => category.code === `lead_${group}`)
        );
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
