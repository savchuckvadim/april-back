import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { smarts } from 'generated/prisma';
import { SmartRepository } from '../repositories/smart.repository';
import { CreateSmartDto } from '../dto/create-smart.dto';
import { UpdateSmartDto } from '../dto/update-smart.dto';
import { SmartResponseDto } from '../dto/smart-response.dto';

@Injectable()
export class SmartService {
    constructor(private readonly repository: SmartRepository) { }

    async create(dto: CreateSmartDto): Promise<SmartResponseDto> {
        try {
            const smart = await this.repository.create({
                type: dto.type,
                group: dto.group,
                name: dto.name,
                title: dto.title,
                entityTypeId: BigInt(dto.entityTypeId),
                portal_id: BigInt(dto.portal_id),
                bitrixId:    BigInt(dto.bitrixId),
                forStageId: BigInt(dto.forStageId),
                forFilterId: BigInt(dto.forFilterId),
                crmId: BigInt(dto.crmId),
                forStage: dto.forStage,
                forFilter: dto.forFilter,
                crm: dto.crm,
            });

            if (!smart) {
                throw new BadRequestException('Failed to create smart');
            }

            return this.mapToResponseDto(smart);
        } catch (error) {
            throw error;
        }
    }

    async findById(id: number): Promise<SmartResponseDto> {
        const smart = await this.repository.findById(id);
        if (!smart) {
            throw new NotFoundException(`Smart with id ${id} not found`);
        }
        return this.mapToResponseDto(smart);
    }

    async findMany(): Promise<SmartResponseDto[]> {
        const smarts = await this.repository.findMany();
        if (!smarts) {
            return [];
        }
        return smarts.map(this.mapToResponseDto);
    }

    async findByPortalId(portalId: number): Promise<SmartResponseDto[]> {
        const smarts = await this.repository.findByPortalId(portalId);
        if (!smarts) {
            return [];
        }
        return smarts.map(this.mapToResponseDto);
    }

    async update(id: number, dto: UpdateSmartDto): Promise<SmartResponseDto> {
        const smart = await this.repository.findById(id);
        if (!smart) {
            throw new NotFoundException(`Smart with id ${id} not found`);
        }

        try {
            const updateData: Partial<smarts> = {};
            if (dto.type !== undefined) updateData.type = dto.type;
            if (dto.group !== undefined) updateData.group = dto.group;
            if (dto.name !== undefined) updateData.name = dto.name;
            if (dto.title !== undefined) updateData.title = dto.title;
            if (dto.entityTypeId !== undefined) updateData.entityTypeId = BigInt(dto.entityTypeId);
            if (dto.portal_id !== undefined) updateData.portal_id = BigInt(dto.portal_id);
            if (dto.bitrixId !== undefined) updateData.bitrixId = dto.bitrixId ? BigInt(dto.bitrixId) : null;
            if (dto.forStageId !== undefined) updateData.forStageId = dto.forStageId ? BigInt(dto.forStageId) : null;
            if (dto.forFilterId !== undefined) updateData.forFilterId = dto.forFilterId ? BigInt(dto.forFilterId) : null;
            if (dto.crmId !== undefined) updateData.crmId = dto.crmId ? BigInt(dto.crmId) : null;
            if (dto.forStage !== undefined) updateData.forStage = dto.forStage;
            if (dto.forFilter !== undefined) updateData.forFilter = dto.forFilter;
            if (dto.crm !== undefined) updateData.crm = dto.crm;

            const updatedSmart = await this.repository.update(id, updateData);
            if (!updatedSmart) {
                throw new BadRequestException('Failed to update smart');
            }
            return this.mapToResponseDto(updatedSmart);
        } catch (error) {
            throw error;
        }
    }

    async delete(id: number): Promise<void> {
        const smart = await this.repository.findById(id);
        if (!smart) {
            throw new NotFoundException(`Smart with id ${id} not found`);
        }

        await this.repository.delete(id);
    }

    private mapToResponseDto(smart: smarts): SmartResponseDto {
        return {
            id: Number(smart.id),
            type: smart.type,
            group: smart.group,
            name: smart.name,
            title: smart.title,
            entityTypeId: Number(smart.entityTypeId),
            portal_id: Number(smart.portal_id),
            bitrixId: smart.bitrixId ? Number(smart.bitrixId) : null,
            forStageId: smart.forStageId ? Number(smart.forStageId) : null,
            forFilterId: smart.forFilterId ? Number(smart.forFilterId) : null,
            crmId: smart.crmId ? Number(smart.crmId) : null,
            forStage: smart.forStage,
            forFilter: smart.forFilter,
            crm: smart.crm,
            created_at: smart.created_at,
            updated_at: smart.updated_at,
        };
    }
}

