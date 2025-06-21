import { PrismaService } from "@/core/prisma/prisma.service";
import { SaveSmartService } from "./save-smart.service";
import { Field } from "../../type/parse.type";
import { PortalService } from "@/modules/portal-konstructor/portal/portal.service";
import { Injectable } from "@nestjs/common";
import { IUserFieldConfig, IUserFieldConfigEnumerationItem } from "@/modules/bitrix";
import { PbxFieldService } from "@/modules/pbx-domain/field/pbx-field.service";
import { PbxFieldEntity, PbxFieldEntityType, PbxFieldItemEntity } from "@/modules/pbx-domain/field/pbx-field.entity";
import { EUserFieldType } from "@/modules/bitrix/domain/userfieldconfig/interface/userfieldconfig.interface";

export class SaveSmartFieldsDto {
    domain: string
    fields: Field[]
    bxFields: SaveSmartBitrixFieldsDto[]
    type: string
    group: string
}

export class SaveSmartBitrixFieldsDto {
    code: string
    field: IUserFieldConfig
}

@Injectable()
export class SaveSmartFieldsService {

    public constructor(
        private readonly prismaService: PrismaService,
        private readonly portalService: PortalService,
        private readonly saveSmartService: SaveSmartService,
        private readonly pbxFieldService: PbxFieldService
    ) { }

    public async installFields(
        dto: SaveSmartFieldsDto
    ) {
        const { domain, fields, bxFields, type, group } = dto
        const portal = await this.portalService.getPortalByDomain(domain)
        if (!portal) throw new Error('Portal not found')
        const portalId = BigInt(portal.id)
        const innerSmart = await this.saveSmartService.getSmart(portalId, type, group)
        if (!innerSmart) throw new Error('Smart not found')

        const savingFields: PbxFieldEntity[] = []
        for (const bxField of bxFields) {
            const savingField = new PbxFieldEntity()
            savingField.name = bxField.field.editFormLabel?.ru || ''
            savingField.title = bxField.field.editFormLabel?.ru || ''
            savingField.code = bxField.code
            savingField.type = bxField.field.userTypeId as EUserFieldType
            savingField.bitrixId = bxField.field.fieldName?.toString() || ''
            savingField.bitrixCamelId = this.getCamelCase(bxField.field.fieldName)
            savingField.entity_type = PbxFieldEntityType.SMART
            savingField.entity_id = innerSmart.id
            savingField.parent_type = `${group}_${type}`
            savingField.items = []
            const items = bxField.field.enum ? (await this.getItems(bxField.field.enum, savingField.id || '')) : []
            savingField.items = items as PbxFieldItemEntity[]
            savingFields.push(savingField)
        }

        const newFields = await this.pbxFieldService.upsertFields(savingFields)
        return newFields
    }

    private async getItems(bxItems: IUserFieldConfigEnumerationItem[], dbField: string | null) {
        if (!bxItems) return []
        const savingItems: PbxFieldItemEntity[] = []
        for (const item of bxItems) {
            if (!item.id) continue
            const savingItem = new PbxFieldItemEntity()
            savingItem.name = item.value
            savingItem.title = item.value
            savingItem.code = item.xmlId
            savingItem.bitrixId = Number(item.id)
            savingItem.bitrixfield_id = BigInt(dbField || '')
            savingItems.push(savingItem)
        }
        return savingItems
    }

    private getCamelCase(str: string) {
        // Удаляем только префикс UF_CRM_ но сохраняем цифры и добавляем ufCrm
        let cleanStr = str.replace(/^UF_CRM_/, '');

        // Разбиваем по подчеркиваниям и преобразуем в camelCase
        const camelCase = cleanStr
            .toLowerCase()
            .split('_')
            .map((word, index) => {
                // Первое слово остается в нижнем регистре, остальные с заглавной буквы
                return index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join('');

        // Добавляем ufCrm в начало
        return 'ufCrm' + camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
    }
}