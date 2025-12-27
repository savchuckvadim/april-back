import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { btx_rpas } from 'generated/prisma';
import { BtxRpaRepository } from '../repositories/btx-rpa.repository';
import { CreateBtxRpaDto } from '../dto/create-btx-rpa.dto';
import { UpdateBtxRpaDto } from '../dto/update-btx-rpa.dto';
import { BtxRpaResponseDto } from '../dto/btx-rpa-response.dto';

@Injectable()
export class BtxRpaService {
    constructor(private readonly repository: BtxRpaRepository) { }

    async create(dto: CreateBtxRpaDto): Promise<BtxRpaResponseDto> {
        try {
            const rpa = await this.repository.create({
                name: dto.name,
                title: dto.title,
                code: dto.code,
                type: dto.type,
                typeId: dto.typeId,
                portal_id: BigInt(dto.portal_id),
                image: dto.image,
                bitrixId: dto.bitrixId ? BigInt(dto.bitrixId) : null,
                description: dto.description,
                entityTypeId: dto.entityTypeId ? BigInt(dto.entityTypeId) : null,
                forStageId: dto.forStageId ? BigInt(dto.forStageId) : null,
                forFilterId: dto.forFilterId ? BigInt(dto.forFilterId) : null,
                crmId: dto.crmId ? BigInt(dto.crmId) : null,
            });

            if (!rpa) {
                throw new BadRequestException('Failed to create RPA');
            }

            return this.mapToResponseDto(rpa);
        } catch (error) {
            throw error;
        }
    }

    async findById(id: number): Promise<BtxRpaResponseDto> {
        const rpa = await this.repository.findById(id);
        if (!rpa) {
            throw new NotFoundException(`RPA with id ${id} not found`);
        }
        return this.mapToResponseDto(rpa);
    }

    async findMany(): Promise<BtxRpaResponseDto[]> {
        const rpas = await this.repository.findMany();
        if (!rpas) {
            return [];
        }
        return rpas.map(this.mapToResponseDto);
    }

    async findByPortalId(portalId: number): Promise<BtxRpaResponseDto[]> {
        const rpas = await this.repository.findByPortalId(portalId);
        if (!rpas) {
            return [];
        }
        return rpas.map(this.mapToResponseDto);
    }

    async update(id: number, dto: UpdateBtxRpaDto): Promise<BtxRpaResponseDto> {
        const rpa = await this.repository.findById(id);
        if (!rpa) {
            throw new NotFoundException(`RPA with id ${id} not found`);
        }

        try {
            const updateData: Partial<btx_rpas> = {};
            if (dto.name !== undefined) updateData.name = dto.name;
            if (dto.title !== undefined) updateData.title = dto.title;
            if (dto.code !== undefined) updateData.code = dto.code;
            if (dto.type !== undefined) updateData.type = dto.type;
            if (dto.typeId !== undefined) updateData.typeId = dto.typeId;
            if (dto.portal_id !== undefined) updateData.portal_id = BigInt(dto.portal_id);
            if (dto.image !== undefined) updateData.image = dto.image;
            if (dto.bitrixId !== undefined) updateData.bitrixId = dto.bitrixId ? BigInt(dto.bitrixId) : null;
            if (dto.description !== undefined) updateData.description = dto.description;
            if (dto.entityTypeId !== undefined) updateData.entityTypeId = dto.entityTypeId ? BigInt(dto.entityTypeId) : null;
            if (dto.forStageId !== undefined) updateData.forStageId = dto.forStageId ? BigInt(dto.forStageId) : null;
            if (dto.forFilterId !== undefined) updateData.forFilterId = dto.forFilterId ? BigInt(dto.forFilterId) : null;
            if (dto.crmId !== undefined) updateData.crmId = dto.crmId ? BigInt(dto.crmId) : null;

            const updatedRpa = await this.repository.update(id, updateData);
            if (!updatedRpa) {
                throw new BadRequestException('Failed to update RPA');
            }
            return this.mapToResponseDto(updatedRpa);
        } catch (error) {
            throw error;
        }
    }

    async delete(id: number): Promise<void> {
        const rpa = await this.repository.findById(id);
        if (!rpa) {
            throw new NotFoundException(`RPA with id ${id} not found`);
        }

        await this.repository.delete(id);
    }

    private mapToResponseDto(rpa: btx_rpas): BtxRpaResponseDto {
        return {
            id: Number(rpa.id),
            name: rpa.name,
            title: rpa.title,
            code: rpa.code,
            type: rpa.type,
            typeId: rpa.typeId,
            portal_id: Number(rpa.portal_id),
            image: rpa.image,
            bitrixId: rpa.bitrixId ? Number(rpa.bitrixId) : null,
            description: rpa.description,
            entityTypeId: rpa.entityTypeId ? Number(rpa.entityTypeId) : null,
            forStageId: rpa.forStageId ? Number(rpa.forStageId) : null,
            forFilterId: rpa.forFilterId ? Number(rpa.forFilterId) : null,
            crmId: rpa.crmId ? Number(rpa.crmId) : null,
            created_at: rpa.created_at,
            updated_at: rpa.updated_at,
        };
    }
}

