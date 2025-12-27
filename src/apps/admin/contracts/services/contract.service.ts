import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { contracts } from 'generated/prisma';
import { ContractRepository } from '../repositories/contract.repository';
import { CreateContractDto } from '../dto/create-contract.dto';
import { UpdateContractDto } from '../dto/update-contract.dto';
import { ContractResponseDto } from '../dto/contract-response.dto';

@Injectable()
export class ContractService {
    constructor(private readonly repository: ContractRepository) { }

    async create(dto: CreateContractDto): Promise<ContractResponseDto> {
        try {
            const contract = await this.repository.create({
                name: dto.name,
                number: dto.number,
                title: dto.title,
                code: dto.code,
                type: dto.type,
                withPrepayment: dto.withPrepayment,
                template: dto.template,
                order: dto.order,
                coefficient: dto.coefficient ?? 1,
                prepayment: dto.prepayment ?? 1,
                discount: dto.discount ?? 1.0,
                productName: dto.productName,
                product: dto.product,
                service: dto.service,
                description: dto.description,
                comment: dto.comment,
                comment1: dto.comment1,
                comment2: dto.comment2,
            });

            if (!contract) {
                throw new BadRequestException('Failed to create contract');
            }

            return this.mapToResponseDto(contract);
        } catch (error) {
            throw error;
        }
    }

    async findById(id: number): Promise<ContractResponseDto> {
        const contract = await this.repository.findById(id);
        if (!contract) {
            throw new NotFoundException(`Contract with id ${id} not found`);
        }
        return this.mapToResponseDto(contract);
    }

    async findMany(): Promise<ContractResponseDto[]> {
        const contracts = await this.repository.findMany();
        if (!contracts) {
            return [];
        }
        return contracts.map(this.mapToResponseDto);
    }

    async update(id: number, dto: UpdateContractDto): Promise<ContractResponseDto> {
        const contract = await this.repository.findById(id);
        if (!contract) {
            throw new NotFoundException(`Contract with id ${id} not found`);
        }

        try {
            const updateData: Partial<contracts> = {};
            if (dto.name !== undefined) updateData.name = dto.name;
            if (dto.number !== undefined) updateData.number = dto.number;
            if (dto.title !== undefined) updateData.title = dto.title;
            if (dto.code !== undefined) updateData.code = dto.code;
            if (dto.type !== undefined) updateData.type = dto.type;
            if (dto.withPrepayment !== undefined) updateData.withPrepayment = dto.withPrepayment;
            if (dto.template !== undefined) updateData.template = dto.template;
            if (dto.order !== undefined) updateData.order = dto.order;
            if (dto.coefficient !== undefined) updateData.coefficient = dto.coefficient;
            if (dto.prepayment !== undefined) updateData.prepayment = dto.prepayment;
            if (dto.discount !== undefined) updateData.discount = dto.discount;
            if (dto.productName !== undefined) updateData.productName = dto.productName;
            if (dto.product !== undefined) updateData.product = dto.product;
            if (dto.service !== undefined) updateData.service = dto.service;
            if (dto.description !== undefined) updateData.description = dto.description;
            if (dto.comment !== undefined) updateData.comment = dto.comment;
            if (dto.comment1 !== undefined) updateData.comment1 = dto.comment1;
            if (dto.comment2 !== undefined) updateData.comment2 = dto.comment2;

            const updatedContract = await this.repository.update(id, updateData);
            if (!updatedContract) {
                throw new BadRequestException('Failed to update contract');
            }
            return this.mapToResponseDto(updatedContract);
        } catch (error) {
            throw error;
        }
    }

    async delete(id: number): Promise<void> {
        const contract = await this.repository.findById(id);
        if (!contract) {
            throw new NotFoundException(`Contract with id ${id} not found`);
        }

        await this.repository.delete(id);
    }

    private mapToResponseDto(contract: contracts): ContractResponseDto {
        return {
            id: Number(contract.id),
            name: contract.name,
            number: contract.number,
            title: contract.title,
            code: contract.code,
            type: contract.type,
            withPrepayment: contract.withPrepayment,
            template: contract.template,
            order: contract.order,
            coefficient: contract.coefficient,
            prepayment: contract.prepayment,
            discount: Number(contract.discount),
            productName: contract.productName,
            product: contract.product,
            service: contract.service,
            description: contract.description,
            comment: contract.comment,
            comment1: contract.comment1,
            comment2: contract.comment2,
            created_at: contract.created_at,
            updated_at: contract.updated_at,
        };
    }
}

