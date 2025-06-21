import { BitrixFieldType } from "@/apps/konstructor/document-generate/dto/pbx-items.dto";
import { PbxField, PbxFieldEntity, PbxFieldEntityType, PbxFieldItem, PbxFieldItemEntity, PbxFieldWithItems } from "../pbx-field.entity";
import { EUserFieldType } from "@/modules/bitrix";

export class FieldDataHelper {
    static createFieldData(field: PbxFieldEntity) {
        return {
            name: field.name,
            title: field.title,
            code: field.code,
            type: field.type,
            bitrixCamelId: field.bitrixCamelId,
            bitrixId: field.bitrixId,
            entity_id: field.entity_id,
            entity_type: field.entity_type,
            parent_type: field.parent_type,
            created_at: new Date(),
            updated_at: new Date(),
        };
    }

    static createFieldUpdateData(field: Partial<PbxFieldEntity>) {
        return {
            name: field.name,
            title: field.title,
            code: field.code,
            type: field.type,
            bitrixCamelId: field.bitrixCamelId,
            bitrixId: field.bitrixId,
            entity_id: field.entity_id,
            entity_type: field.entity_type,
            parent_type: field.parent_type,
            updated_at: new Date(),
        };
    }

    static createFieldItemData(fieldId: string, item: PbxFieldItemEntity) {
        return {
            bitrixfield_id: BigInt(fieldId),
            name: item.name,
            title: item.title,
            code: item.code,
            bitrixId: item.bitrixId,
            created_at: new Date(),
            updated_at: new Date(),
        };
    }

    static createFieldItemsData(fieldId: string, items: PbxFieldItemEntity[]) {
        return items.map(item => this.createFieldItemData(fieldId, item));
    }
    
    static getFieldEntity(field: PbxFieldWithItems): PbxFieldEntity {
        const entity = new PbxFieldEntity();
        entity.id = field.id.toString();
        entity.name = field.name;
        entity.title = field.title;
        entity.code = field.code;
        entity.type = field.type as BitrixFieldType | EUserFieldType | 'multiple';
        entity.bitrixCamelId = field.bitrixCamelId;
        entity.bitrixId = field.bitrixId;
        entity.entity_id = field.entity_id;
        entity.entity_type = field.entity_type as PbxFieldEntityType;
        entity.parent_type = field.parent_type;
        // entity.created_at = item.created_at?.toISOString() || '';
        // entity.updated_at = item.updated_at?.toISOString() || '';
        entity.items = field.bitrixfield_items?.map(item => this.getFieldItemEntity(item)) || [];
   
        return entity;
    }
    
    static getFieldItemEntity(item: PbxFieldItem): PbxFieldItemEntity {
        const entity = new PbxFieldItemEntity();
        entity.id = item.id.toString();
        entity.name = item.name;
        entity.title = item.title;
        entity.code = item.code;
        entity.bitrixId = item.bitrixId;

    
        return entity;
    }
} 