import { Injectable } from "@nestjs/common";
import { InitSupplyDto } from "../../dto/init-supply.dto";
import { PortalModel } from "@/modules/portal/services/portal.model";
import { IBxRpaItem } from "@/modules/bitrix";
import { PbxCompanyDto } from "../../dto/pbx-company.dto";
import { EntityFormFieldDto } from "@/apps/konstructor/document-generate/dto/entity-form-field/entity-form-field.dto";
import { PbxDealDto, PbxDealEnum } from "../../dto/pbx-deal.dto";
import { InitSupplyBxrqService } from "../bxrq/init-supply-bxrq.service";


@Injectable()
export class InitSupplyRpaPbxItemsFieldsService {
 

    public async get(dto: InitSupplyDto, PortalModel: PortalModel) {

        
        const rpaType = PortalModel.getRpaByCode('supply')
        const rpaTypeId = rpaType?.bitrixId
        if (!rpaTypeId) {
            throw new Error('Rpa type id not found')
        }


        const rpaNameField = PortalModel.getRpaFieldBitrixIdByCode('supply', 'name')
        const bxCompanyItemsRpaValues = this.getBxCompnyItemsRpaValues(dto.bxCompanyItems, PortalModel)
        const bxDealItemsRpaValues = this.getBxDealItemsRpaValues(dto.bxDealItems, PortalModel)

        const rpaFields = {
           
            ...bxCompanyItemsRpaValues,
            ...bxDealItemsRpaValues,
 


        } as Partial<IBxRpaItem>




        return rpaFields;
    }

    private getBxCompnyItemsRpaValues(bxCompanyItems: PbxCompanyDto, PortalModel: PortalModel): Record<string, string | number> {
        let result = {} as Record<string, string | number>
        const portalRpa = PortalModel.getRpaByCode('supply')
        if (!portalRpa) {
            throw new Error('Rpa not found')
        }
        for (const key in bxCompanyItems) {
            const pbxItem = bxCompanyItems[key] as EntityFormFieldDto


            if (pbxItem.current) {
                const fieldResult = this.processPbxEntityField(pbxItem, PortalModel, key)
                fieldResult && (result = { ...result, ...fieldResult })
            }
        }
        return result
    }

    private getBxDealItemsRpaValues(bxDealItems: PbxDealDto, PortalModel: PortalModel): any {
        let result = {} as Record<string, string | number>
        const portalRpa = PortalModel.getRpaByCode('supply')
        if (!portalRpa) {
            throw new Error('Rpa not found')
        }

        const enumValues = Object.values(PbxDealEnum);
        for (const key in bxDealItems) {

            const pbxItem = bxDealItems[key] as EntityFormFieldDto
            const isTargetField = enumValues.includes(pbxItem.field.code as PbxDealEnum)

            if (isTargetField) {
                const fieldResult = this.processPbxEntityField(pbxItem, PortalModel, key)
                fieldResult && (result = { ...result, ...fieldResult })

                if (pbxItem.field.code === PbxDealEnum.garant_client_email) {
                    const email = pbxItem.current || '' as string
                    const rpaKey = 'service_email_complect'

                    const fieldResult = this.processPbxEntityField(pbxItem, PortalModel, rpaKey)
                    fieldResult && (result = { ...result, ...fieldResult })
                }
            }
        }
        return result
    }



    private processPbxEntityField(pbxItem: EntityFormFieldDto, PortalModel: PortalModel, key: string): Record<string, string | number> | undefined {
        const result = {} as Record<string, string | number>
        if (pbxItem.current) {
            if (pbxItem.field.code === 'op_source_select' || pbxItem.field.code === 'situation_comments') { //пропускаем источник
                return undefined
            }
            if (typeof pbxItem.current === 'string') {
                console.log(key)
                console.log(pbxItem.field.code)
                const rpaFieldBitrixId = PortalModel.getRpaFieldBitrixIdByCode('supply', key)
                if (rpaFieldBitrixId) {
                    result[rpaFieldBitrixId] = pbxItem.current

                }
            } else if (typeof pbxItem.current === 'object') {
                const rpaField = PortalModel.getRpaFieldByCode('supply', key)
                if (!rpaField) {
                    console.log('Rpa field not found', key)
                    console.log(pbxItem)
                    return undefined
                }
                const rpaFieldBitrixId = PortalModel.getRpaFieldBitrixIdByCode('supply', key)
                const rpaFieldItemBitrixId = PortalModel.getFieldItemByCode(rpaField, pbxItem.current.code)


                if (rpaFieldBitrixId && rpaFieldItemBitrixId) {
                    result[rpaFieldBitrixId] = rpaFieldItemBitrixId?.bitrixId
                }
            }
        }

        return result
    }




}