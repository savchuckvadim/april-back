import {
    PbxFieldEntity,
    PbxFieldItem,
    PbxFieldItemEntity,
    PbxFieldWithItems,
} from '../entity/pbx-field.entity';
import { EUserFieldType } from '@/modules/bitrix';
import { bigintConvertToNumber } from '@/shared';
import { PbxEntityTypePrisma } from '@/shared/enums';

export function mapFromDbToEntityField(
    field: PbxFieldWithItems,
): PbxFieldEntity {
    const entity = new PbxFieldEntity();
    entity.id = field.id.toString();
    entity.name = field.name;
    entity.title = field.title;
    entity.code = field.code;
    entity.type = field.type as EUserFieldType | 'multiple';
    entity.bitrixId = field.bitrixId;
    entity.bitrixCamelId = field.bitrixCamelId;
    entity.entity_id = bigintConvertToNumber(field.entity_id);
    entity.entity_type = field.entity_type as PbxEntityTypePrisma;
    entity.parent_type = field.parent_type;
    entity.items =
        field.bitrixfield_items?.map(item =>
            mapFromDbToEntityFieldListItem(item),
        ) || [];
    return entity;
}

function mapFromDbToEntityFieldListItem(
    item: PbxFieldItem,
): PbxFieldItemEntity {
    const entity = new PbxFieldItemEntity();
    entity.id = item.id.toString();
    entity.name = item.name;
    entity.title = item.title;
    entity.code = item.code;
    entity.bitrixfield_id = bigintConvertToNumber(item.bitrixfield_id);
    entity.bitrixId = item.bitrixId;
    return entity;
}
