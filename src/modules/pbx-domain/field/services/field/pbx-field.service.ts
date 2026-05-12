import { Injectable } from '@nestjs/common';
import { PbxFieldRepository } from '../../repositories/pbx-field.repositry';
import { PbxField, PbxFieldEntity } from '../../entity/pbx-field.entity';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { mapFromDbToEntityField } from '../../lib/map-from-db-to-entity-field.util';

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

    async upsertFields(fields: PbxFieldEntity[]): Promise<PbxFieldEntity[]> {
        const result = await this.pbxFieldRepository.upsertFields(fields);
        return result.map(field => mapFromDbToEntityField(field));
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
