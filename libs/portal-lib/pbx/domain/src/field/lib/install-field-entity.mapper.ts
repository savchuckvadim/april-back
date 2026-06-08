import { bigintConvertToNumber } from '@/shared';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { PbxSalesEventField } from '../type/sales/event/pbx-sales-event-field.type';
import { PbxSalesKonstructorField } from '../type/sales/konstructor/pbx-sales-konstructor-field.type';
import { PbxFieldEntity, PbxFieldItemEntity } from '../entity/pbx-field.entity';
import { mapFieldTypeToBitrixType } from './field-type-to-bx.mapper';

/** Элемент списка из PBX sales field (`items` / `list`) перед сохранением в БД. */
export type PortalInstallFieldListItem = {
    code: string;
    name?: string;
    title?: string;
    bitrixId?: string | number;
};

export type PortalFieldWithInstallLists =
    | PbxSalesEventField
    | PbxSalesKonstructorField;

export function mapPortalInstallFieldListItem(
    item: PortalInstallFieldListItem,
): PbxFieldItemEntity {
    const entity = new PbxFieldItemEntity();
    entity.name = item.name || item.code;
    entity.title = item.title || item.code;
    entity.code = item.code;
    entity.bitrixId =
        typeof item.bitrixId === 'number'
            ? item.bitrixId
            : parseInt(item.bitrixId || '0', 10);
    entity.bitrixfield_id = 0;
    return entity;
}

export function mapPortalInstallFieldListItems(
    items: PortalInstallFieldListItem[] | null | undefined,
): PbxFieldItemEntity[] {
    return (items ?? []).map(mapPortalInstallFieldListItem);
}

export function mapFieldItemsFromPortalField(
    field: PortalFieldWithInstallLists,
    itemKey: 'items' | 'list',
): PbxFieldItemEntity[] {
    const raw = (field[itemKey] || []) as PortalInstallFieldListItem[];
    return mapPortalInstallFieldListItems(raw);
}

export interface BuildPbxFieldEntityFromPortalInstallParams {
    field: PortalFieldWithInstallLists;
    itemKey: 'items' | 'list';
    entityId: bigint;
    entityType: PbxEntityTypePrisma;
    bitrixFieldId: string | number;
    parentType?: string;
    bitrixCamelId?: string;
}

/** Сборка `PbxFieldEntity` из описания поля sales/konstructor для upsert в портал (обратно к `FieldDataHelper`, который мапит Prisma → entity). */
export function buildPbxFieldEntityFromPortalInstall(
    params: BuildPbxFieldEntityFromPortalInstallParams,
): PbxFieldEntity {
    const {
        field,
        itemKey,
        entityId,
        entityType,
        bitrixFieldId,
        parentType = '',
        bitrixCamelId = '',
    } = params;

    const fieldEntity = new PbxFieldEntity();
    fieldEntity.name = field.name;
    fieldEntity.title = field.name;
    fieldEntity.code = field.code;
    fieldEntity.type = mapFieldTypeToBitrixType(field.type);
    fieldEntity.bitrixId = `UF_CRM_${bitrixFieldId}`;
    fieldEntity.bitrixCamelId = bitrixCamelId;
    fieldEntity.entity_id = bigintConvertToNumber(entityId);
    fieldEntity.entity_type = entityType;
    fieldEntity.parent_type = parentType;
    fieldEntity.isPlural = field.isMultiple;
    fieldEntity.items = mapFieldItemsFromPortalField(field, itemKey);
    return fieldEntity;
}
