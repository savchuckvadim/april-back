import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { bx_rqs } from 'generated/prisma';
import { BxRqRepository } from '../repositories/bx-rq.repository';
import { CreateBxRqDto } from '../dto/create-bx-rq.dto';
import { UpdateBxRqDto } from '../dto/update-bx-rq.dto';
import { BxRqResponseDto } from '../dto/bx-rq-response.dto';

@Injectable()
export class BxRqService {
    constructor(private readonly repository: BxRqRepository) { }

    async create(dto: CreateBxRqDto): Promise<BxRqResponseDto> {
        try {
            const rq = await this.repository.create({
                portal_id: dto.portal_id ? BigInt(dto.portal_id) : null,
                name: dto.name,
                code: dto.code,
                type: dto.type,
                bitrix_id: dto.bitrix_id,
                xml_id: dto.xml_id,
                entity_type_id: dto.entity_type_id,
                country_id: dto.country_id,
                is_active: dto.is_active ?? true,
                sort: dto.sort,
            });

            if (!rq) {
                throw new BadRequestException('Failed to create RQ');
            }

            return this.mapToResponseDto(rq);
        } catch (error) {
            throw error;
        }
    }

    async findById(id: number): Promise<BxRqResponseDto> {
        const rq = await this.repository.findById(id);
        if (!rq) {
            throw new NotFoundException(`RQ with id ${id} not found`);
        }
        return this.mapToResponseDto(rq);
    }

    async findMany(): Promise<BxRqResponseDto[]> {
        const rqs = await this.repository.findMany();
        if (!rqs) {
            return [];
        }
        return rqs.map(this.mapToResponseDto);
    }

    async findByPortalId(portalId: number): Promise<BxRqResponseDto[]> {
        const rqs = await this.repository.findByPortalId(portalId);
        if (!rqs) {
            return [];
        }
        return rqs.map(this.mapToResponseDto);
    }

    async update(id: number, dto: UpdateBxRqDto): Promise<BxRqResponseDto> {
        const rq = await this.repository.findById(id);
        if (!rq) {
            throw new NotFoundException(`RQ with id ${id} not found`);
        }

        try {
            const updateData: Partial<bx_rqs> = {};
            if (dto.portal_id !== undefined) updateData.portal_id = dto.portal_id ? BigInt(dto.portal_id) : null;
            if (dto.name !== undefined) updateData.name = dto.name;
            if (dto.code !== undefined) updateData.code = dto.code;
            if (dto.type !== undefined) updateData.type = dto.type;
            if (dto.bitrix_id !== undefined) updateData.bitrix_id = dto.bitrix_id;
            if (dto.xml_id !== undefined) updateData.xml_id = dto.xml_id;
            if (dto.entity_type_id !== undefined) updateData.entity_type_id = dto.entity_type_id;
            if (dto.country_id !== undefined) updateData.country_id = dto.country_id;
            if (dto.is_active !== undefined) updateData.is_active = dto.is_active;
            if (dto.sort !== undefined) updateData.sort = dto.sort;

            const updatedRq = await this.repository.update(id, updateData);
            if (!updatedRq) {
                throw new BadRequestException('Failed to update RQ');
            }
            return this.mapToResponseDto(updatedRq);
        } catch (error) {
            throw error;
        }
    }

    async delete(id: number): Promise<void> {
        const rq = await this.repository.findById(id);
        if (!rq) {
            throw new NotFoundException(`RQ with id ${id} not found`);
        }

        await this.repository.delete(id);
    }

    private mapToResponseDto(rq: bx_rqs): BxRqResponseDto {
        return {
            id: Number(rq.id),
            portal_id: rq.portal_id ? Number(rq.portal_id) : null,
            name: rq.name,
            code: rq.code,
            type: rq.type,
            bitrix_id: rq.bitrix_id,
            xml_id: rq.xml_id,
            entity_type_id: rq.entity_type_id,
            country_id: rq.country_id,
            is_active: rq.is_active,
            sort: rq.sort,
            created_at: rq.created_at,
            updated_at: rq.updated_at,
        };
    }
}

