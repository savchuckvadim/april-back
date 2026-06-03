import {
    PbxField,
    PbxFieldEntity,
    PbxFieldItem,
    PbxFieldItemEntity,
    PbxFieldWithItems,
} from '../entity/pbx-field.entity';
import { PbxEntityTypePrisma } from '@/shared/enums';

export abstract class PbxFieldRepository {
    abstract findByEntityId(
        entity: PbxEntityTypePrisma,
        entityId: bigint,
    ): Promise<PbxFieldEntity[]>;
    abstract findManyWithItems(ids: bigint[]): Promise<PbxFieldEntity[]>;
    abstract addField(field: PbxFieldEntity): Promise<PbxField>;
    abstract addFields(fields: PbxFieldEntity[]): Promise<PbxField[]>;
    abstract upsertFields(
        fields: PbxFieldEntity[],
    ): Promise<PbxFieldWithItems[]>;
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
    abstract updateFieldItemNameById(
        fieldItemId: string,
        newValue: string,
    ): Promise<PbxFieldItem>;
    abstract deleteFieldsByIds(fieldIds: bigint[]): Promise<void>;
    abstract deleteFieldsByEntityId(
        entity: PbxEntityTypePrisma,
        entityId: bigint,
    ): Promise<void>;
    abstract findByEntityIdAndCodes(
        entity: PbxEntityTypePrisma,
        entityId: bigint,
        codes: string[],
    ): Promise<PbxFieldEntity[]>;
}
