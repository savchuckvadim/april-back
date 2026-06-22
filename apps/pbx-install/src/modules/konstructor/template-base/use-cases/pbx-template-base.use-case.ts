import { Injectable, NotFoundException } from '@nestjs/common';
import {
    CreateTemplateBaseData,
    TemplateBaseEntity,
    TemplateBaseRepository,
    UpdateTemplateBaseData,
} from '@lib/portal-lib/konstructor';

/**
 * CRUD-оркестрация шаблонов конструктора и связи «шаблон ↔ поле»
 * (`template_field`) для pbx-install. Доменный доступ — через
 * {@link TemplateBaseRepository} из `@lib/portal-lib/konstructor`.
 */
@Injectable()
export class PbxTemplateBaseUseCase {
    constructor(private readonly repository: TemplateBaseRepository) {}

    async list(): Promise<TemplateBaseEntity[]> {
        return (await this.repository.findManyWithRelations()) ?? [];
    }

    async getById(id: number): Promise<TemplateBaseEntity> {
        const entity = await this.repository.findById(id);
        if (!entity) {
            throw new NotFoundException(`Шаблон с id ${id} не найден`);
        }
        return entity;
    }

    async create(data: CreateTemplateBaseData): Promise<TemplateBaseEntity> {
        return this.repository.create(data);
    }

    async update(
        id: number,
        data: UpdateTemplateBaseData,
    ): Promise<TemplateBaseEntity> {
        await this.getById(id);
        return this.repository.update(id, data);
    }

    async remove(id: number): Promise<void> {
        await this.getById(id);
        await this.repository.delete(id);
    }

    async attachField(
        templateId: number,
        fieldId: number,
    ): Promise<TemplateBaseEntity> {
        await this.getById(templateId);
        await this.repository.attachField(templateId, fieldId);
        return this.getById(templateId);
    }

    async detachField(
        templateId: number,
        fieldId: number,
    ): Promise<TemplateBaseEntity> {
        await this.getById(templateId);
        await this.repository.detachField(templateId, fieldId);
        return this.getById(templateId);
    }
}
