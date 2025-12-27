import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { btx_companies } from 'generated/prisma';
import { BtxCompanyRepository } from '../repositories/btx-company.repository';
import { CreateBtxCompanyDto } from '../dto/create-btx-company.dto';
import { UpdateBtxCompanyDto } from '../dto/update-btx-company.dto';
import { BtxCompanyResponseDto } from '../dto/btx-company-response.dto';

@Injectable()
export class BtxCompanyService {
    constructor(private readonly repository: BtxCompanyRepository) {}

    async create(dto: CreateBtxCompanyDto): Promise<BtxCompanyResponseDto> {
        try {
            const company = await this.repository.create({
                name: dto.name,
                title: dto.title,
                code: dto.code,
                portal_id: BigInt(dto.portal_id),
            });

            if (!company) {
                throw new BadRequestException('Failed to create company');
            }

            return this.mapToResponseDto(company);
        } catch (error) {
            throw error;
        }
    }

    async findById(id: number): Promise<BtxCompanyResponseDto> {
        const company = await this.repository.findById(id);
        if (!company) {
            throw new NotFoundException(`Company with id ${id} not found`);
        }
        return this.mapToResponseDto(company);
    }

    async findMany(): Promise<BtxCompanyResponseDto[]> {
        const companies = await this.repository.findMany();
        if (!companies) {
            return [];
        }
        return companies.map(this.mapToResponseDto);
    }

    async findByPortalId(portalId: number): Promise<BtxCompanyResponseDto[]> {
        const companies = await this.repository.findByPortalId(portalId);
        if (!companies) {
            return [];
        }
        return companies.map(this.mapToResponseDto);
    }

    async update(id: number, dto: UpdateBtxCompanyDto): Promise<BtxCompanyResponseDto> {
        const company = await this.repository.findById(id);
        if (!company) {
            throw new NotFoundException(`Company with id ${id} not found`);
        }

        try {
            const updateData: Partial<btx_companies> = {};
            if (dto.name !== undefined) updateData.name = dto.name;
            if (dto.title !== undefined) updateData.title = dto.title;
            if (dto.code !== undefined) updateData.code = dto.code;
            if (dto.portal_id !== undefined) updateData.portal_id = BigInt(dto.portal_id);

            const updatedCompany = await this.repository.update(id, updateData);
            if (!updatedCompany) {
                throw new BadRequestException('Failed to update company');
            }
            return this.mapToResponseDto(updatedCompany);
        } catch (error) {
            throw error;
        }
    }

    async delete(id: number): Promise<void> {
        const company = await this.repository.findById(id);
        if (!company) {
            throw new NotFoundException(`Company with id ${id} not found`);
        }

        await this.repository.delete(id);
    }

    private mapToResponseDto(company: btx_companies): BtxCompanyResponseDto {
        return {
            id: Number(company.id),
            name: company.name,
            title: company.title,
            code: company.code,
            portal_id: Number(company.portal_id),
            created_at: company.created_at,
            updated_at: company.updated_at,
        };
    }
}

