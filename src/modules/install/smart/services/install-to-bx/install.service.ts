import { Injectable } from "@nestjs/common";
import { PortalSmartService } from "../portal-smart.service";
import { ParseSmartService } from "../parse/parse-service";
import { InstallSmartDto } from "../../dto/install-smart.dto";
import { PBXService } from "@/modules/pbx";
import { BitrixOwnerTypeId } from "@/modules/bitrix/domain/enums/bitrix-constants.enum";
import { IBXSmartType } from "@/modules/bitrix/domain/crm/smart-type";
import { InstallSmartFieldsService } from "./install-smart-fields.service";
import { EUserFieldType, IUserFieldConfig } from "@/modules/bitrix/domain/userfieldconfig/interface/userfieldconfig.interface";
import { IBXItem } from "@/modules/bitrix/domain/crm/item/interface/item.interface";
import { SaveSmartService } from "../save/save-smart.service";
import { SaveSmartFieldsService } from "../save/save-smart-fields.service";
import { IBitrixBatchResponseResult } from "@/modules/bitrix/core/interface/bitrix-api.intterface";


@Injectable()
export class PbxInstallSmartService {

    constructor(
        private readonly parseSmartService: ParseSmartService,
        private readonly portalSmartService: PortalSmartService,
        private readonly pbxService: PBXService,
        private readonly saveSmartService: SaveSmartService,
        private readonly saveSmartFieldsService: SaveSmartFieldsService
    ) { }

    async installSmart(dto: InstallSmartDto) {
        const { bitrix } = await this.pbxService.init(dto.domain);
        const parsedSmartData = await this.parseSmartService.getParsedData(dto.smartName);


        const bxResults: any[] = [];

        const smart = parsedSmartData[0]
        const bxResponse = await bitrix.smartType.add({

            fields: {
                title: smart.title,
                // entityTypeId: Number(smart.entityTypeId),
                isUseInUserfieldEnabled: 'Y',
                isAutomationEnabled: 'Y',
                isBeginCloseDatesEnabled: 'Y',
                isBizProcEnabled: 'Y',
                isCategoriesEnabled: 'Y',
                isClientEnabled: 'Y',
                isDocumentsEnabled: 'Y',
                isLinkWithProductsEnabled: 'Y',
                isMycompanyEnabled: 'Y',
                isRecyclebinEnabled: 'Y',
                isStagesEnabled: 'Y',
                relations: {
                    parent: [
                        {
                            entityTypeId: BitrixOwnerTypeId.DEAL,
                            isChildrenListEnabled: 'Y'
                        },

                    ]
                }
            }
        })

        bxResults.push(bxResponse);
        // Функция для создания задержки

        if (bxResponse.result.type.id) {

            // Обработка полей с задержкой между запросами
            const installSmartFieldsService = new InstallSmartFieldsService(bitrix)
            const bxFieldsResults = await installSmartFieldsService.installFields(smart.fields, bxResponse.result.type.id)
            const preparedBxFields = this.prepareBitrixFieldsResults(bxFieldsResults)
            // const smartField = smart.fields.find(field => field.type === EUserFieldType.STRING) || smart.fields[0]
            // const field = bxFieldsResults[0].result[`${smartField.code}`].field



            // const testSmartItemAdd = await bitrix.item.add(
            //     bxResponse.result.type.entityTypeId,
            //     {
            //         title: 'test',


            //     })
            // let item: IBXItem | null = null
            // const testItemId = testSmartItemAdd.result.item.id
            // if (testItemId) {
            //     const testSmartItem = await bitrix.item.get(
            //         testItemId,
            //         bxResponse.result.type.entityTypeId
            //     )
            //     item = testSmartItem.result.item
            // }

           const savedSmart = await this.saveSmartService.saveSmart(dto.domain, bxResponse.result.type, smart.type, smart.group)
            const savedFields = await this.saveSmartFieldsService.installFields({
                domain: dto.domain,
                fields: smart.fields,
                bxFields: preparedBxFields,
                type: smart.type,
                group: smart.group
            })

            const portalSmart = await this.portalSmartService.getSmartsByPortalDomain(dto.domain);
            return { bxFieldsResults, portalSmart, bxResults, savedSmart, savedFields };
        }
        return {
            error: 'Fields not created',

            bxResults
        };

    }
    private prepareBitrixFieldsResults(bxFieldsResults: IBitrixBatchResponseResult[]): { code: string, field: IUserFieldConfig }[] {

        const fields: { code: string, field: IUserFieldConfig }[] = []
        for (const result of bxFieldsResults) {
            for (const key in result.result) {
                const field = result.result[key].field as IUserFieldConfig
                fields.push({ code: key, field: field })
            }
        }
        return fields
    }


    async testItem(id: number, entityTypeId: string, domain: string) {
        const { bitrix } = await this.pbxService.init(domain);
        const item = await bitrix.item.list(entityTypeId, { id }, ['id', 'title',])
        return item
    }



}