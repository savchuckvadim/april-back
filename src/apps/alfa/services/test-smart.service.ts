import { PBXService } from "@/modules/pbx";
import { Injectable } from "@nestjs/common";
import { bxSmartEntityTypeId } from "../bx-data/bx-smart-data";
import { BitrixService, EBXEntity, EBxMethod, EBxNamespace, IBXItem, IBXStatus } from "@/modules/bitrix";


@Injectable()
export class TestSmartService {
    constructor(
        private readonly pbx: PBXService
    ) { }

    async getSmarts(domain: string) {
        const { bitrix } = await this.pbx.init(domain);
        const smarts = await bitrix.api.callType(
            EBxNamespace.CRM,
            EBXEntity.TYPE,
            EBxMethod.LIST,
            //@ts-ignore
            {}
        );
        return smarts;
    }

    async getSmartFieldsById(id: string, domain: string) {
        const { bitrix } = await this.pbx.init(domain);
        const smart = await bitrix.api.callType(
            EBxNamespace.CRM,
            EBXEntity.TYPE,
            EBxMethod.GET_BY_ENTITY_TYPE_ID,
            { entityTypeId: id }
        );
        return smart;
    }

    async getSmartCategories(domain: string, entityTypeId: string) {
        const { bitrix } = await this.pbx.init(domain);
        const smarts = await bitrix.api.callType(
            EBxNamespace.CRM,
            EBXEntity.CATEGORY,
            EBxMethod.LIST,
            { entityTypeId }
        );
        return smarts.result.categories;
    }

    async getSmartDataById(domain: string, entityTypeId: string,) {
        const { bitrix } = await this.pbx.init(domain);
        const smart = await bitrix.api.callType(
            EBxNamespace.CRM,
            EBXEntity.TYPE,
            EBxMethod.GET_BY_ENTITY_TYPE_ID,
            {
                entityTypeId
            }
        );
        if (!smart.result) {
            return null;
        }
        return await this.getSmartData(smart.result.type, entityTypeId, bitrix);

    }

    async getAllSmarts(domain: string,) {
        const { bitrix } = await this.pbx.init(domain);
        const smartsResponse = await bitrix.api.callType(
            EBxNamespace.CRM,
            EBXEntity.TYPE,
            EBxMethod.LIST,
             //@ts-ignore
            {}
        );
        const smarts = [] as IBXItem[]
        // @ts-ignore
        for (const smart of smartsResponse.result.types) {
            smarts.push(await this.getSmartData(smart, smart.entityTypeId, bitrix));
        }
        return smarts;

    }

    private async getSmartData(smart: IBXItem, entityTypeId: string, bitrix: BitrixService) {
        const categoriesResponse = await bitrix.api.callType(
            EBxNamespace.CRM,
            EBXEntity.CATEGORY,
            EBxMethod.LIST,
            { entityTypeId, }
        );
        const categories = [] as { id: number, name: string, stages: IBXStatus[] }[]
        for (const category of categoriesResponse.result.categories) {
            const stagesResponse = await bitrix.api.callType(
                EBxNamespace.CRM,
                EBXEntity.STATUS,
                EBxMethod.LIST,
                {
                    filter: {
                        CATEGORY_ID: category.id
                    }
                }
            );
            const categoryData = {
                id: category.id,
                name: category.name,
                stages: stagesResponse.result
            }
            categories.push(categoryData);
        }
        return {

            ...smart,
            categories

        };

    }
}