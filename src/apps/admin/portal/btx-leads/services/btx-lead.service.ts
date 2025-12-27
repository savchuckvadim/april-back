import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { btx_leads } from 'generated/prisma';
import { BtxLeadRepository } from '../repositories/btx-lead.repository';
import { CreateBtxLeadDto } from '../dto/create-btx-lead.dto';
import { UpdateBtxLeadDto } from '../dto/update-btx-lead.dto';
import { BtxLeadResponseDto } from '../dto/btx-lead-response.dto';

@Injectable()
export class BtxLeadService {
    constructor(private readonly repository: BtxLeadRepository) { }

    async create(dto: CreateBtxLeadDto): Promise<BtxLeadResponseDto> {
        try {
            const lead = await this.repository.create({
                name: dto.name,
                title: dto.title,
                code: dto.code,
                portal_id: BigInt(dto.portal_id),
            });

            if (!lead) {
                throw new BadRequestException('Failed to create lead');
            }

            return this.mapToResponseDto(lead);
        } catch (error) {
            throw error;
        }
    }

    async findById(id: number): Promise<BtxLeadResponseDto> {
        const lead = await this.repository.findById(id);
        if (!lead) {
            throw new NotFoundException(`Lead with id ${id} not found`);
        }
        return this.mapToResponseDto(lead);
    }

    async findMany(): Promise<BtxLeadResponseDto[]> {
        const leads = await this.repository.findMany();
        if (!leads) {
            return [];
        }
        return leads.map(this.mapToResponseDto);
    }

    async findByPortalId(portalId: number): Promise<BtxLeadResponseDto[]> {
        const leads = await this.repository.findByPortalId(portalId);
        if (!leads) {
            return [];
        }
        return leads.map(this.mapToResponseDto);
    }

    async update(id: number, dto: UpdateBtxLeadDto): Promise<BtxLeadResponseDto> {
        const lead = await this.repository.findById(id);
        if (!lead) {
            throw new NotFoundException(`Lead with id ${id} not found`);
        }

        try {
            const updateData: Partial<btx_leads> = {};
            if (dto.name !== undefined) updateData.name = dto.name;
            if (dto.title !== undefined) updateData.title = dto.title;
            if (dto.code !== undefined) updateData.code = dto.code;
            if (dto.portal_id !== undefined) updateData.portal_id = BigInt(dto.portal_id);

            const updatedLead = await this.repository.update(id, updateData);
            if (!updatedLead) {
                throw new BadRequestException('Failed to update lead');
            }
            return this.mapToResponseDto(updatedLead);
        } catch (error) {
            throw error;
        }
    }

    async delete(id: number): Promise<void> {
        const lead = await this.repository.findById(id);
        if (!lead) {
            throw new NotFoundException(`Lead with id ${id} not found`);
        }

        await this.repository.delete(id);
    }

    private mapToResponseDto(lead: btx_leads): BtxLeadResponseDto {
        return {
            id: Number(lead.id),
            name: lead.name,
            title: lead.title,
            code: lead.code,
            portal_id: Number(lead.portal_id),
            created_at: lead.created_at,
            updated_at: lead.updated_at,
        };
    }
}

