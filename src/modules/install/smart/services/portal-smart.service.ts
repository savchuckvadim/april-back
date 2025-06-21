import { PrismaService } from "@/core/prisma";
import { Injectable, NotFoundException } from "@nestjs/common";
import { PbxFieldService } from "@/modules/pbx-domain/field/pbx-field.service";
import { PbxFieldEntityType } from "@/modules/pbx-domain/field/pbx-field.entity";
import { SmartGroupEnum, SmartNameEnum } from "../dto/install-smart.dto";
import { PortalService } from "@/modules/portal-konstructor/portal/portal.service";

//TODO refactoring to portal-smart-domain
export type PortalSmart = NonNullable<Awaited<ReturnType<PrismaService['smarts']['findUnique']>>>;
@Injectable()
export class PortalSmartService {

    constructor(
        private readonly prisma: PrismaService,
        private readonly pbxFieldService: PbxFieldService,
        private readonly portalService: PortalService
    ) { }

    async getSmartByPortalAndName(domain: string, smartName: SmartNameEnum) {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new Error('Portal not found');
        }
        const smart = await this.prisma.smarts.findFirst({
            where: {
                portal_id: BigInt(portal.id.toString()),
                type: smartName
            }
        });
        if (!smart) {
            throw new Error('Smart not found');
        }
        return await this.getSmartEntity(smart);
    }

    async getSmartsByPortalDomain(domain: string) {
        const portal = await this.prisma.portals.findFirst({
            where: { domain },
            select: {
                id: true,
                domain: true,
                smarts: true
            }
        });
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }

        const smarts = await Promise.all(portal.smarts.map(async (smart) => await this.getSmartEntity(smart)));
        return {
            ...portal,
            id: Number(portal.id),
            smarts
        };
    }
    private async getSmartEntity(smart: PortalSmart) {
        const categories = await this.getSmartCategories(smart.id);
        const fields = await this.getSmartFields(smart.id);
        return {
            id: Number(smart.id),
            portal_id: Number(smart.portal_id),
            entity: smart.entityTypeId.toString(),
            entityTypeId: smart.entityTypeId.toString(),

            type: smart.type.toString(),
            group: smart.group.toString(),
            name: smart.name.toString(),
            title: smart.title.toString(),
            categories,
            fields,
        };
    }

    private async getSmartFields(smartId: bigint) {
        return await this.pbxFieldService.findByEntityId(
            PbxFieldEntityType.SMART,
            smartId
        )

    }

    private async getSmartCategories(smartId: bigint) {
        const categories = await this.prisma.btx_categories.findMany({
            where: {
                entity_type: 'App\\Models\\Smart',
                entity_id: smartId
            }
        });

        const result = await Promise.all(categories.map(async (category) => ({
            id: Number(category.id),
            name: category.name,
            code: category.code,
            parent_type: category.parent_type,
            stages: await this.getCategoryStages(category.id)
        })));
        return result;
    }
    private async getCategoryStages(categoryId: bigint) {
        const stages = await this.prisma.btx_stages.findMany({
            where: {
                btx_category_id: categoryId
            }
        });
        return stages.map(stage => ({
            id: Number(stage.id),
            name: stage.name,
            code: stage.code,
            bitrixId: stage.bitrixId.toString(),
            btx_category_id: Number(stage.btx_category_id)
        }));
    }


    
    async deleteSmartByPortalAndName(domain: string, smartName: SmartNameEnum, smartGroup: SmartGroupEnum) {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new Error('Portal not found');
        }
        const smart = await this.prisma.smarts.findFirst({
            where: {
                portal_id: BigInt(portal.id.toString()),
                type: smartName,
                group: smartGroup
            }
        });
        if (!smart) {
            throw new Error('Smart not found');
        }
        await this.pbxFieldService.deleteFieldsByEntityId(PbxFieldEntityType.SMART, smart.id);
        await this.prisma.smarts.delete({
            where: { id: smart.id }
        });
        return { 
            deleted: smart.id.toString(),
            portalSmarts: await this.getSmartsByPortalDomain(domain)
        };
    }

}