import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { portal_contracts } from 'generated/prisma';
import { PortalContractRepository } from '../repositories/portal-contract.repository';
import { CreatePortalContractDto } from '../dto/create-portal-contract.dto';
import { UpdatePortalContractDto } from '../dto/update-portal-contract.dto';
import { PortalContractResponseDto } from '../dto/portal-contract-response.dto';

@Injectable()
export class PortalContractService {
    constructor(private readonly repository: PortalContractRepository) { }

    async create(dto: CreatePortalContractDto): Promise<PortalContractResponseDto> {
        try {
            const portalContract = await this.repository.create({
                portal_id: BigInt(dto.portal_id),
                contract_id: BigInt(dto.contract_id),
                portal_measure_id: BigInt(dto.portal_measure_id),
                bitrixfield_item_id: BigInt(dto.bitrixfield_item_id),
                title: dto.title,
                template: dto.template,
                order: dto.order,
                productName: dto.productName,
                description: dto.description,
            });

            if (!portalContract) {
                throw new BadRequestException('Failed to create portal contract');
            }

            return this.mapToResponseDto(portalContract);
        } catch (error) {
            throw error;
        }
    }

    async findById(id: number): Promise<PortalContractResponseDto> {
        const portalContract = await this.repository.findById(id);
        if (!portalContract) {
            throw new NotFoundException(`Portal contract with id ${id} not found`);
        }
        return this.mapToResponseDto(portalContract);
    }

    async findMany(): Promise<PortalContractResponseDto[]> {
        const portalContracts = await this.repository.findMany();
        if (!portalContracts) {
            return [];
        }
        return portalContracts.map(this.mapToResponseDto);
    }

    async findByPortalId(portalId: number): Promise<PortalContractResponseDto[]> {
        const portalContracts = await this.repository.findByPortalId(portalId);
        if (!portalContracts) {
            return [];
        }
        return portalContracts.map(this.mapToResponseDto);
    }

    async findByContractId(contractId: number): Promise<PortalContractResponseDto[]> {
        const portalContracts = await this.repository.findByContractId(contractId);
        if (!portalContracts) {
            return [];
        }
        return portalContracts.map(this.mapToResponseDto);
    }

    async update(id: number, dto: UpdatePortalContractDto): Promise<PortalContractResponseDto> {
        const portalContract = await this.repository.findById(id);
        if (!portalContract) {
            throw new NotFoundException(`Portal contract with id ${id} not found`);
        }

        try {
            const updateData: Partial<portal_contracts> = {};
            if (dto.portal_id !== undefined) updateData.portal_id = BigInt(dto.portal_id);
            if (dto.contract_id !== undefined) updateData.contract_id = BigInt(dto.contract_id);
            if (dto.portal_measure_id !== undefined) updateData.portal_measure_id = BigInt(dto.portal_measure_id);
            if (dto.bitrixfield_item_id !== undefined) updateData.bitrixfield_item_id = BigInt(dto.bitrixfield_item_id);
            if (dto.title !== undefined) updateData.title = dto.title;
            if (dto.template !== undefined) updateData.template = dto.template;
            if (dto.order !== undefined) updateData.order = dto.order;
            if (dto.productName !== undefined) updateData.productName = dto.productName;
            if (dto.description !== undefined) updateData.description = dto.description;

            const updatedPortalContract = await this.repository.update(id, updateData);
            if (!updatedPortalContract) {
                throw new BadRequestException('Failed to update portal contract');
            }
            return this.mapToResponseDto(updatedPortalContract);
        } catch (error) {
            throw error;
        }
    }

    async delete(id: number): Promise<void> {
        const portalContract = await this.repository.findById(id);
        if (!portalContract) {
            throw new NotFoundException(`Portal contract with id ${id} not found`);
        }

        await this.repository.delete(id);
    }

    private mapToResponseDto(portalContract: portal_contracts): PortalContractResponseDto {
        return {
            id: Number(portalContract.id),
            portal_id: Number(portalContract.portal_id),
            contract_id: Number(portalContract.contract_id),
            portal_measure_id: Number(portalContract.portal_measure_id),
            bitrixfield_item_id: Number(portalContract.bitrixfield_item_id),
            title: portalContract.title,
            template: portalContract.template,
            order: portalContract.order,
            productName: portalContract.productName,
            description: portalContract.description,
            created_at: portalContract.created_at,
            updated_at: portalContract.updated_at,
        };
    }
}

