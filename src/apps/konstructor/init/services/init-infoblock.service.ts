import { Injectable } from "@nestjs/common";
import { InfoblockEntity, InfogroupEntity, InfogroupService } from "@/modules/garant";


export interface InfoGroups {
    id: number
    code: string
    groupName: string
    type: string
    productType: string
    value: Infoblock[]
}
interface Infoblock {
    id: number
    name: string
    code: string
    weight: number
    infogroupId: number
    infohroupCode: string
    infohroupName: string
    shortDescription: string
    description: string
    descriptionForSale: string
    parent: string[]
    children: string[]
    isSet: boolean
    isFree: boolean
    isLa: boolean
}
@Injectable()
export class InitInfoblockService {
    constructor(
      
        private readonly infogroupService: InfogroupService
    ) { }

    async get(): Promise<InfoGroups[] | null> {
      
        const infogroups = await this.infogroupService.findMany()
        if (!infogroups) return null

       
        return this.getGroups(infogroups)
    }

    private getGroups(groups: InfogroupEntity[]): InfoGroups[] {
        return groups.map(group => {
            return this.getInfogroupItem(group)
        })
    }
    private getInfogroupItem(infogroup: InfogroupEntity): InfoGroups {
        return {
            id: Number(infogroup.id),
            code: infogroup.code || '',
            groupName: infogroup.name || '',
            type: infogroup.type || '',
            productType: infogroup.productType || '',
            value: infogroup.infoblocks?.map(infoblock => this.getInfoblockItem(infogroup, infoblock)) || [],
        }
    }
    private getInfoblockItem(group: InfogroupEntity, infoblock: InfoblockEntity): Infoblock {
        return {
            id: Number(infoblock.id),
            name: infoblock.name || '',
            code: infoblock.code || '',
            weight: Number(infoblock.weight) || 0,
            infogroupId: Number(group.id) || 0,
            infohroupCode: group.code || '',
            infohroupName: group.name || '',
            shortDescription: infoblock.shortDescription || '',
            description: infoblock.description || '',
            descriptionForSale: infoblock.descriptionForSale || '',
            parent: infoblock.packages?.map(pack => pack.code) || [],
            children: infoblock.packageInfoblocks?.map(pack => pack.code) || [],
            isSet: infoblock.isSet || false,
            isFree: infoblock.isFree || false,
            isLa: infoblock.isLa || false,
        }
    }
}