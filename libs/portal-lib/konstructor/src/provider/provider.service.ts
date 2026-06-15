import { Injectable, NotFoundException } from '@nestjs/common';
import { ProviderRepository } from './provider.repository';
import {
    CreateProviderWithRqInput,
    ProviderEntityWithRq,
    RqEntity,
    RqInput,
} from './provider.entity';
@Injectable()
export class ProviderService {
    constructor(private readonly providerRepository: ProviderRepository) {}

    async findById(id: number): Promise<RqEntity | null> {
        return await this.providerRepository.findById(id);
    }

    async findByDomain(domain: string): Promise<ProviderEntityWithRq[] | null> {
        return await this.providerRepository.findByDomain(domain);
    }

    async createWithRq(
        input: CreateProviderWithRqInput,
    ): Promise<ProviderEntityWithRq> {
        return await this.providerRepository.createWithRq(input);
    }

    async updateRq(id: number, data: Partial<RqInput>): Promise<RqEntity> {
        const rq = await this.providerRepository.updateRq(id, data);
        if (!rq) {
            throw new NotFoundException(`Реквизиты с id=${id} не найдены`);
        }
        return rq;
    }

    async delete(id: number): Promise<void> {
        const deleted = await this.providerRepository.delete(id);
        if (!deleted) {
            throw new NotFoundException(`Поставщик с id=${id} не найден`);
        }
    }
}
