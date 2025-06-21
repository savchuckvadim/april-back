import { PbxField, PbxFieldEntity, PbxFieldEntityType, PbxFieldItem, PbxFieldItemEntity } from "./pbx-field.entity";


export abstract class PbxFieldRepository {
    abstract findByEntityId(entity: PbxFieldEntityType, entityId: bigint): Promise<PbxFieldEntity[]>;
    abstract addField(field: PbxFieldEntity): Promise<PbxField>;
    abstract addFields(fields: PbxFieldEntity[]): Promise<PbxField[]>;
    abstract upsertFields(fields: PbxFieldEntity[]): Promise<PbxField[]>;
    abstract addFieldItem(fieldId: string, fieldItem: PbxFieldItemEntity): Promise<PbxFieldItem>;
    abstract updateField(fieldId: string, field: Partial<PbxFieldEntity>): Promise<PbxField>;
    abstract deleteField(fieldId: string): Promise<void>;
    abstract deleteFieldItem(fieldItemId: string): Promise<void>;
    abstract deleteFieldsByEntityId(entity: PbxFieldEntityType, entityId: bigint): Promise<void>;
}





