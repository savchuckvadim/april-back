import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { contracts } from 'generated/prisma';
import { ContractRepository } from './contract.repository';

/**
 * Доменный сервис глобальных видов договоров (`contracts`).
 *
 * Работает с prisma-сущностями, не с HTTP-DTO. Маппинг в ответ — на стороне
 * презентационного слоя (admin-контроллеры).
 */
@Injectable()
export class ContractService {
    constructor(private readonly repository: ContractRepository) {}

    async create(data: Partial<contracts>): Promise<contracts> {
        const contract = await this.repository.create(data);
        if (!contract) {
            throw new BadRequestException('Failed to create contract');
        }
        return contract;
    }

    async findById(id: number): Promise<contracts> {
        const contract = await this.repository.findById(id);
        if (!contract) {
            throw new NotFoundException(`Contract with id ${id} not found`);
        }
        return contract;
    }

    async findMany(): Promise<contracts[]> {
        const contracts = await this.repository.findMany();
        return contracts ?? [];
    }

    async update(id: number, data: Partial<contracts>): Promise<contracts> {
        await this.findById(id);
        const updated = await this.repository.update(id, data);
        if (!updated) {
            throw new BadRequestException('Failed to update contract');
        }
        return updated;
    }

    async delete(id: number): Promise<void> {
        await this.findById(id);
        await this.repository.delete(id);
    }
}
