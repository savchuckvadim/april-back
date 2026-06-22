import { Injectable, NotFoundException } from '@nestjs/common';
import {
    CounterEntity,
    CounterRepository,
    CreateCounterData,
    UpdateCounterData,
} from '@lib/portal-lib/konstructor';

/**
 * CRUD-оркестрация счётчиков конструктора (`counters`) для pbx-install.
 * Доменный доступ — через {@link CounterRepository} из `@lib/portal-lib/konstructor`.
 */
@Injectable()
export class PbxCounterUseCase {
    constructor(private readonly repository: CounterRepository) {}

    async list(): Promise<CounterEntity[]> {
        return (await this.repository.findMany()) ?? [];
    }

    async getById(id: number): Promise<CounterEntity> {
        const entity = await this.repository.findById(id);
        if (!entity) {
            throw new NotFoundException(`Счётчик с id ${id} не найден`);
        }
        return entity;
    }

    async create(data: CreateCounterData): Promise<CounterEntity> {
        return this.repository.create(data);
    }

    async update(id: number, data: UpdateCounterData): Promise<CounterEntity> {
        await this.getById(id);
        return this.repository.update(id, data);
    }

    async remove(id: number): Promise<void> {
        await this.getById(id);
        await this.repository.delete(id);
    }
}
