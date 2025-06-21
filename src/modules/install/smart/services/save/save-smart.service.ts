import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/prisma";
import { IBXSmartType } from "@/modules/bitrix/domain/crm/smart-type";
import { PortalService } from "@/modules/portal-konstructor/portal/portal.service";

@Injectable()
export class SaveSmartService {

    public constructor(
        private readonly prismaService: PrismaService,
        private readonly portalService: PortalService
    ) { }

    public async saveSmart(domain: string, bxSmart: IBXSmartType, type: string, group: string) {



        const portal = await this.getPortal(domain)
        const portalId = BigInt(portal.id)
        const smart = await this.getSmart(portalId, type, group)
        const entityTypeId = Number(bxSmart.entityTypeId)
        const updatedData = {
            entityTypeId: entityTypeId,
            name: bxSmart.title,
            title: bxSmart.title,
            bitrixId: Number(bxSmart.id),
            updated_at: new Date(),
            forStage: `DT${entityTypeId}_`,
            forStageId: entityTypeId,
            crmId: entityTypeId,
            forFilterId: entityTypeId,
            forFilter: `DYNAMIC_${entityTypeId}_`,
        }
        if (!smart) {
            await this.prismaService.smarts.create({
                data: {
                    portal_id: BigInt(portal.id),
                    type: type,
                    group: group,
                    created_at: new Date(),

                    ...updatedData
                },

            })
        } else {
            await this.prismaService.smarts.update({
                where: { id: smart.id },
                data: updatedData
            })
        }
    }
    // private async createSmart(portalId: bigint, bxSmart: IBXSmartType, type: string, group: string) {
    //     await this.prismaService.smarts.create({
    //         data: {
    //             portal_id: portalId,
    //             entityTypeId: Number(bxSmart.entityTypeId)
    //         }
    //     })
    // }

    // private async updateSmart(smartId: bigint, bxSmart: IBXSmartType, type: string, group: string) {
    //     await this.prismaService.smarts.update({
    //         where: { id: smartId },
    //         data: {
    //             entityTypeId: Number(bxSmart.entityTypeId)
    //         }
    //     })
    // }

    public async getSmart(portalId: bigint, type: string, group: string) {

        const smart = await this.prismaService.smarts.findFirst({
            where: {
                portal_id: portalId,
                type: type,
                group: group
            }
        })
        return smart
    }


    private async getPortal(domain: string) {
        const portal = await this.portalService.getPortalByDomain(domain)
        if (!portal) throw new Error('Portal not found')
        return portal
    }
}