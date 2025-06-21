import { BitrixService, IUserFieldConfig, IUserFieldConfigEnumerationItem } from "@/modules/bitrix";
import { Field, ListItem } from "../../type/parse.type";
import { EUserFieldType } from '@/modules/bitrix/domain/userfieldconfig/interface/userfieldconfig.interface'
import { IBitrixBatchResponseResult } from "@/modules/bitrix/core/interface/bitrix-api.intterface";


export class InstallSmartFieldsService {

    public constructor(
        private readonly bitrix: BitrixService
    ) { }

    public async installFields(fields: Field[], smartId: number): Promise<IBitrixBatchResponseResult[]> {

        for (const field of fields) {
            if (!field.isNeedUpdate) continue;

            const fltToBx: Partial<IUserFieldConfig> = this.getFldToBx(field, smartId)

            this.bitrix.batch.userFieldConfig.addBtch(
                field.code,
                {
                    moduleId: 'crm',
                    field: fltToBx
                });



        }
        return await this.bitrix.api.callBatchWithConcurrency(1)

    }

    private getFldToBx(field: Field, smartId: number): Partial<IUserFieldConfig> {
        const fltToBx: Partial<IUserFieldConfig> = {
            entityId: `CRM_${smartId}`,
            userTypeId: field.type,
            fieldName: `UF_CRM_${smartId}_${field.smart}`,
            multiple: field.isMultiple ? 'Y' : 'N',
            mandatory: 'N',
            showFilter: 'Y',
            showInList: 'Y',
            editInList: 'Y',
            isSearchable: 'Y',
            sort: field.order,
            xmlId: field.code,
            editFormLabel: {
                'ru': field.name,
            }

        }
        if (field.type === EUserFieldType.ENUMERATION) {
            fltToBx.enum = this.getFldEnumeration(field.list)
        }
        return fltToBx
    }

    private getFldEnumeration(list: ListItem[]): IUserFieldConfigEnumerationItem[] {
        return list.map(item => this.getFldEnumerationItem(item))
    }

    private getFldEnumerationItem(item: ListItem): IUserFieldConfigEnumerationItem {
        return {
            value: item.VALUE,
            def: 'N',
            sort: item.SORT,
            xmlId: item.CODE
        }
    }
}   