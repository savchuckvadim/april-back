import { Injectable } from '@nestjs/common';
import { IUserFieldConfig } from '@/modules/bitrix';
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
import { IPbxTypedFieldInstallData } from './typed-entity-field.types';

export interface TypedEntityFieldOwner {
    /** Тип «владельца» в портальной БД (`SMART`, `BTX_RPA`, ...). */
    entityType: PbxEntityType;
    /** Id строки-якоря (`smarts.id`, `btx_rpa.id`). */
    entityDbId: number;
    /**
     * `parent_type` для зеркала в `t_fields`. Для смарта — `${group}_${type}`,
     * для RPA — обычно `'rpa'` или другой стабильный префикс по соглашению.
     */
    parentType: string;
}

/**
 * Зеркало для типизированных полей в портальной БД (`t_fields` + `bitrixfield_items`).
 * Контракт зеркала отличается от `PortalEntityFieldInstallService` только источником
 * `parent_type` (явный параметр от резолвера, а не `parsedField.appType`) и shape `bxField`
 * (`IUserFieldConfig` вместо `IBXField`).
 */
@Injectable()
export class PortalFieldTypedEntityInstallService {
    constructor(private readonly pbxFieldService: PbxFieldService) {}

    async syncWithDb(
        owner: TypedEntityFieldOwner,
        fields: IPbxTypedFieldInstallData[],
    ): Promise<PbxFieldEntity[]> {
        const prismaEntityType = getPrismaEntityTypeByType(owner.entityType);
        const entities: PbxFieldEntity[] = fields.map(f =>
            this.buildEntity(
                f,
                prismaEntityType,
                owner.entityDbId,
                owner.parentType,
            ),
        );
        return this.pbxFieldService.upsertFields(entities);
    }

    private buildEntity(
        field: IPbxTypedFieldInstallData,
        entityType: PbxEntityTypePrisma,
        entityId: number,
        parentType: string,
    ): PbxFieldEntity {
        const e = new PbxFieldEntity();
        e.entity_type = entityType;
        e.entity_id = entityId;
        e.parent_type = parentType;
        e.name = field.bxField.editFormLabel?.ru ?? field.parsedField.name;
        e.title = field.bxField.editFormLabel?.ru ?? field.parsedField.name;
        e.code = field.parsedField.code;
        e.type = field.parsedField.type;
        e.isPlural = field.bxField.multiple === 'Y';
        e.bitrixId = String(
            field.bxField.fieldName ?? field.parsedField.bxFieldName,
        );
        e.bitrixCamelId = getCamelBxFieldIdCase(
            String(field.bxField.fieldName ?? field.parsedField.bxFieldName),
        );
        if (
            field.parsedField.type === 'enumeration' &&
            field.bxField.enum &&
            field.parsedField.list.length > 0
        ) {
            e.items = this.buildItems(field.bxField.enum);
        } else {
            e.items = [];
        }
        return e;
    }

    private buildItems(
        bxItems: NonNullable<IUserFieldConfig['enum']>,
    ): PbxFieldItemEntity[] {
        const out: PbxFieldItemEntity[] = [];
        for (const item of bxItems) {
            if (item.id == null) continue;
            const itemEntity = new PbxFieldItemEntity();
            itemEntity.name = item.value;
            itemEntity.title = item.value;
            itemEntity.code = String(item.xmlId ?? '');
            itemEntity.bitrixId = Number(item.id);
            out.push(itemEntity);
        }
        return out;
    }
}
