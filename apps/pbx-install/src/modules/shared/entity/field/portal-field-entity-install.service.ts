import { Injectable } from '@nestjs/common';
import {
    getPrismaEntityTypeByType,
    PbxEntityType,
    PbxEntityTypePrisma,
} from '@/shared/enums';

import {
    PbxFieldEntity,
    PbxFieldItemEntity,
    PbxFieldService,
} from '@/modules/pbx-domain';
import { getCamelBxFieldIdCase } from '../../utils/get-camel-case-bx-field.util';
import { IBXField } from '@/modules/bitrix';
import { Field } from '../../parse-field-excel/type/parse-field.type';
export interface IPbxFieldInstallData {
    code: string;
    result: number | boolean;
    parsedField: Field;
    bxField: IBXField;
}

@Injectable()
export class PortalEntityFieldInstallService {
    constructor(private readonly pbxFieldService: PbxFieldService) {}

    async syncWithDb(
        entityType: PbxEntityType,
        entityId: number,
        fields: IPbxFieldInstallData[],
    ): Promise<PbxFieldEntity[]> {
        //получаем entity type нужный для записи в db
        const prismaEntityType = getPrismaEntityTypeByType(entityType);

        // собираем pbxFieldEntities для записи в db
        const pbxFieldEntities: PbxFieldEntity[] = fields.map(field =>
            this.getPbxFieldEntity(field, prismaEntityType, entityId),
        );
        // записываем pbxFieldEntities в db - добавляем либо удаляем
        return await this.pbxFieldService.upsertFields(pbxFieldEntities);
    }

    private getPbxFieldEntity(
        field: IPbxFieldInstallData,
        entityType: PbxEntityTypePrisma,
        entityId: number,
    ): PbxFieldEntity {
        console.log('getPbxFieldEntity field', field);
        const pbxFieldEntity = new PbxFieldEntity();
        pbxFieldEntity.entity_type = entityType;
        pbxFieldEntity.parent_type = field.parsedField.appType;
        pbxFieldEntity.entity_id = entityId;
        pbxFieldEntity.name = field.parsedField.name;
        pbxFieldEntity.title = field.parsedField.name;
        pbxFieldEntity.code = field.parsedField.code;
        pbxFieldEntity.type = field.parsedField.type;
        pbxFieldEntity.isPlural = false;
        pbxFieldEntity.bitrixId = field.parsedField.bxFieldName.toString();
        pbxFieldEntity.bitrixCamelId = getCamelBxFieldIdCase(
            field.bxField.FIELD_NAME,
        );
        if (
            field.parsedField.type === 'enumeration' &&
            field.bxField.LIST &&
            field.parsedField.list.length > 0
        ) {
            pbxFieldEntity.items = this.getPbxFieldItemEntity(field);
        }
        return pbxFieldEntity;
    }
    private getPbxFieldItemEntity(
        field: IPbxFieldInstallData,
    ): PbxFieldItemEntity[] {
        if (
            field.parsedField.type === 'enumeration' &&
            field.bxField?.LIST &&
            field.parsedField.list.length > 0
        ) {
            const list = field.bxField.LIST?.map(item => {
                if (!item.ID) {
                    return null;
                }
                const pbxFieldItemEntity = new PbxFieldItemEntity();
                pbxFieldItemEntity.name = item.VALUE;
                pbxFieldItemEntity.title = item.VALUE;
                pbxFieldItemEntity.code = item.XML_ID?.toString() || '';
                pbxFieldItemEntity.bitrixId = Number(item.ID);
                return pbxFieldItemEntity;
            });
            return list.filter(item => item !== null);
        }
        return [];
    }
}
