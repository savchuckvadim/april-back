import {
    BitrixService,
    IUserFieldConfig,
    IUserFieldConfigEnumerationItem,
} from '@/modules/bitrix';
import {
    Field,
    ListItem,
} from '@/modules/install/shared/parse-field-excel/type/parse-field.type';
import { EUserFieldType } from '@/modules/bitrix/domain/userfieldconfig/interface/userfieldconfig.interface';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { mapFieldTypeToBitrixType } from '@/modules/pbx-domain/field/lib/field-type-to-bx.mapper';

/**
 * Пакетная установка пользовательских полей смарт-процесса в Bitrix (без записи в БД портала).
 * Переиспользуемый кусок для install-сценариев; контекст смарта задаётся через `BitrixService` + smartId.
 */
export class InstallSmartFieldsService {
    public constructor(private readonly bitrix: BitrixService) {}

    public async installFields(
        fields: Field[],
        smartId: number,
    ): Promise<IBitrixBatchResponseResult[]> {
        for (const field of fields) {
            if (!field.isNeedUpdate) continue;

            const fltToBx: Partial<IUserFieldConfig> = this.getFldToBx(
                field,
                smartId,
            );

            this.bitrix.batch.userFieldConfig.addBtch(field.code, {
                moduleId: 'crm',
                field: fltToBx,
            });
        }
        return await this.bitrix.api.callBatchWithConcurrency(1);
    }

    private getFldToBx(
        field: Field,
        smartId: number,
    ): Partial<IUserFieldConfig> {
        const fieldBxType: EUserFieldType = mapFieldTypeToBitrixType(
            field.type,
        );
        const fltToBx: Partial<IUserFieldConfig> = {
            entityId: `CRM_${smartId}`,
            userTypeId: fieldBxType,
            fieldName: `UF_CRM_${smartId}_${field.bxFieldName}`,
            multiple: field.isMultiple ? 'Y' : 'N',
            mandatory: 'N',
            showFilter: 'Y',
            showInList: 'Y',
            editInList: 'Y',
            isSearchable: 'Y',
            sort: field.order,
            xmlId: field.code,
            editFormLabel: {
                ru: field.name,
            },
        };
        if (fieldBxType === EUserFieldType.ENUMERATION) {
            fltToBx.enum = this.getFldEnumeration(field.list);
        }
        return fltToBx;
    }

    private getFldEnumeration(
        list: ListItem[],
    ): IUserFieldConfigEnumerationItem[] {
        return list.map(item => this.getFldEnumerationItem(item));
    }

    private getFldEnumerationItem(
        item: ListItem,
    ): IUserFieldConfigEnumerationItem {
        return {
            value: item.VALUE,
            def: 'N',
            sort: item.SORT,
            xmlId: item.CODE,
        };
    }
}
