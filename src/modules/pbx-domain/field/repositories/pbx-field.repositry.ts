import {
    PbxField,
    PbxFieldEntity,
    PbxFieldItem,
    PbxFieldItemEntity,
} from '../entity/pbx-field.entity';
import { PbxEntityTypePrisma } from '@/shared/enums';

export abstract class PbxFieldRepository {
    abstract findByEntityId(
        entity: PbxEntityTypePrisma,
        entityId: bigint,
    ): Promise<PbxFieldEntity[]>;
    abstract addField(field: PbxFieldEntity): Promise<PbxField>;
    abstract addFields(fields: PbxFieldEntity[]): Promise<PbxField[]>;
    abstract upsertFields(fields: PbxFieldEntity[]): Promise<PbxField[]>;
    abstract addFieldItem(
        fieldId: string,
        fieldItem: PbxFieldItemEntity,
    ): Promise<PbxFieldItem>;
    abstract updateField(
        fieldId: string,
        field: Partial<PbxFieldEntity>,
    ): Promise<PbxField>;
    abstract deleteField(fieldId: string): Promise<void>;
    abstract deleteFieldItem(fieldItemId: string): Promise<void>;
    abstract deleteFieldsByEntityId(
        entity: PbxEntityTypePrisma,
        entityId: bigint,
    ): Promise<void>;
}
