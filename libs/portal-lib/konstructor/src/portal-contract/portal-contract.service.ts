import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { portal_contracts } from 'generated/prisma';
import { PortalContractRepository } from './portal-contract.repository';

/**
 * Доменный сервис портальных договоров (`portal_contracts`).
 *
 * Работает с prisma-сущностями (с relations), не с HTTP-DTO. Initial-данные для
 * формы создания собирает {@link PortalContractFormService}.
 */
@Injectable()
export class PortalContractService {
    constructor(private readonly repository: PortalContractRepository) {}

    async create(data: Partial<portal_contracts>): Promise<portal_contracts> {
        const portalContract = await this.repository.create(data);
        if (!portalContract) {
            throw new BadRequestException('Failed to create portal contract');
        }
        return portalContract;
    }

    async findById(id: number): Promise<portal_contracts> {
        const portalContract = await this.repository.findById(id);
        if (!portalContract) {
            throw new NotFoundException(
                `Portal contract with id ${id} not found`,
            );
        }
        return portalContract;
    }

    async findMany(): Promise<portal_contracts[]> {
        const portalContracts = await this.repository.findMany();
        return portalContracts ?? [];
    }

    async findByPortalId(portalId: number): Promise<portal_contracts[]> {
        const portalContracts = await this.repository.findByPortalId(portalId);
        return portalContracts ?? [];
    }

    async findByContractId(contractId: number): Promise<portal_contracts[]> {
        const portalContracts =
            await this.repository.findByContractId(contractId);
        return portalContracts ?? [];
    }

    async update(
        id: number,
        data: Partial<portal_contracts>,
    ): Promise<portal_contracts> {
        await this.findById(id);
        const updated = await this.repository.update(id, data);
        if (!updated) {
            throw new BadRequestException('Failed to update portal contract');
        }
        return updated;
    }

    async delete(id: number): Promise<void> {
        await this.findById(id);
        await this.repository.delete(id);
    }
}
