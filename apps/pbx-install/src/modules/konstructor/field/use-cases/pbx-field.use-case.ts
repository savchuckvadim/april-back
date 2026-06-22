import { Injectable, NotFoundException } from '@nestjs/common';
import {
    CreateFieldData,
    FieldEntity,
    FieldRepository,
    UpdateFieldData,
} from '@lib/portal-lib/konstructor';

/**
 * CRUD-оркестрация полей конструктора (`fields`) для pbx-install.
 * Доменный доступ — через {@link FieldRepository} из `@lib/portal-lib/konstructor`.
 */
@Injectable()
export class PbxFieldUseCase {
    constructor(private readonly repository: FieldRepository) {}

    async list(): Promise<FieldEntity[]> {
        return (await this.repository.findMany()) ?? [];
    }

    async getById(id: number): Promise<FieldEntity> {
        const entity = await this.repository.findById(id);
        if (!entity) {
            throw new NotFoundException(`Поле с id ${id} не найдено`);
        }
        return entity;
    }

    async create(data: CreateFieldData): Promise<FieldEntity> {
        return this.repository.create(data);
    }

    async update(id: number, data: UpdateFieldData): Promise<FieldEntity> {
        await this.getById(id);
        return this.repository.update(id, data);
    }

    async remove(id: number): Promise<void> {
        await this.getById(id);
        await this.repository.delete(id);
    }
}
