import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { measures } from 'generated/prisma';
import { MeasureRepository } from './measure.repository';

/**
 * Доменный сервис глобальных единиц измерения (`measures`).
 *
 * Работает с prisma-сущностями, не с HTTP-DTO. Маппинг в ответ — на стороне
 * презентационного слоя (admin-контроллеры).
 */
@Injectable()
export class MeasureService {
    constructor(private readonly repository: MeasureRepository) {}

    async create(data: Partial<measures>): Promise<measures> {
        const measure = await this.repository.create(data);
        if (!measure) {
            throw new BadRequestException('Failed to create measure');
        }
        return measure;
    }

    async findById(id: number): Promise<measures> {
        const measure = await this.repository.findById(id);
        if (!measure) {
            throw new NotFoundException(`Measure with id ${id} not found`);
        }
        return measure;
    }

    async findMany(): Promise<measures[]> {
        const measures = await this.repository.findMany();
        return measures ?? [];
    }

    async update(id: number, data: Partial<measures>): Promise<measures> {
        await this.findById(id);
        const updated = await this.repository.update(id, data);
        if (!updated) {
            throw new BadRequestException('Failed to update measure');
        }
        return updated;
    }

    async delete(id: number): Promise<void> {
        await this.findById(id);
        await this.repository.delete(id);
    }
}
