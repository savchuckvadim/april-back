import { Injectable } from '@nestjs/common';
import { PbxFieldRepository } from '../../repositories/pbx-field.repositry';
import { PbxField, PbxFieldEntity } from '../../entity/pbx-field.entity';
import { PbxEntityTypePrisma } from '@/shared/enums';

@Injectable()
export class PbxFieldService {
    constructor(private readonly pbxFieldRepository: PbxFieldRepository) {}

    async findByEntityId(
        entity: PbxEntityTypePrisma,
        entityId: bigint,
    ): Promise<PbxFieldEntity[]> {
        return this.pbxFieldRepository.findByEntityId(entity, entityId);
    }

    async addField(field: PbxFieldEntity): Promise<PbxField> {
        return this.pbxFieldRepository.addField(field);
    }
    async addFields(fields: PbxFieldEntity[]): Promise<PbxField[]> {
        return this.pbxFieldRepository.addFields(fields);
    }

    async upsertFields(fields: PbxFieldEntity[]): Promise<PbxField[]> {
        return this.pbxFieldRepository.upsertFields(fields);
    }

    async updateField(
        fieldId: string,
        field: Partial<PbxFieldEntity>,
    ): Promise<PbxField> {
        return this.pbxFieldRepository.updateField(fieldId, field);
    }

    async deleteField(fieldId: string): Promise<void> {
        return this.pbxFieldRepository.deleteField(fieldId);
    }

    async deleteFieldItem(fieldItemId: string): Promise<void> {
        return this.pbxFieldRepository.deleteFieldItem(fieldItemId);
    }

    async deleteFieldsByEntityId(
        entity: PbxEntityTypePrisma,
        entityId: bigint,
    ): Promise<void> {
        return this.pbxFieldRepository.deleteFieldsByEntityId(entity, entityId);
    }
}
