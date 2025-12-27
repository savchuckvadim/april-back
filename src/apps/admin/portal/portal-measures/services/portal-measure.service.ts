import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { portal_measure } from 'generated/prisma';
import { PortalMeasureRepository } from '../repositories/portal-measure.repository';
import { CreatePortalMeasureDto } from '../dto/create-portal-measure.dto';
import { UpdatePortalMeasureDto } from '../dto/update-portal-measure.dto';
import { PortalMeasureResponseDto } from '../dto/portal-measure-response.dto';

@Injectable()
export class PortalMeasureService {
    constructor(private readonly repository: PortalMeasureRepository) { }

    async create(dto: CreatePortalMeasureDto): Promise<PortalMeasureResponseDto> {
        try {
            const portalMeasure = await this.repository.create({
                measure_id: BigInt(dto.measure_id),
                portal_id: BigInt(dto.portal_id),
                bitrixId: dto.bitrixId,
                name: dto.name,
                shortName: dto.shortName,
                fullName: dto.fullName,
            });

            if (!portalMeasure) {
                throw new BadRequestException('Failed to create portal measure');
            }

            return this.mapToResponseDto(portalMeasure);
        } catch (error) {
            throw error;
        }
    }

    async findById(id: number): Promise<PortalMeasureResponseDto> {
        const portalMeasure = await this.repository.findById(id);
        if (!portalMeasure) {
            throw new NotFoundException(`Portal measure with id ${id} not found`);
        }
        return this.mapToResponseDto(portalMeasure);
    }

    async findMany(): Promise<PortalMeasureResponseDto[]> {
        const portalMeasures = await this.repository.findMany();
        if (!portalMeasures) {
            return [];
        }
        return portalMeasures.map(this.mapToResponseDto);
    }

    async findByPortalId(portalId: number): Promise<PortalMeasureResponseDto[]> {
        const portalMeasures = await this.repository.findByPortalId(portalId);
        if (!portalMeasures) {
            return [];
        }
        return portalMeasures.map(this.mapToResponseDto);
    }

    async findByMeasureId(measureId: number): Promise<PortalMeasureResponseDto[]> {
        const portalMeasures = await this.repository.findByMeasureId(measureId);
        if (!portalMeasures) {
            return [];
        }
        return portalMeasures.map(this.mapToResponseDto);
    }

    async update(id: number, dto: UpdatePortalMeasureDto): Promise<PortalMeasureResponseDto> {
        const portalMeasure = await this.repository.findById(id);
        if (!portalMeasure) {
            throw new NotFoundException(`Portal measure with id ${id} not found`);
        }

        try {
            const updateData: Partial<portal_measure> = {};
            if (dto.measure_id !== undefined) updateData.measure_id = BigInt(dto.measure_id);
            if (dto.portal_id !== undefined) updateData.portal_id = BigInt(dto.portal_id);
            if (dto.bitrixId !== undefined) updateData.bitrixId = dto.bitrixId;
            if (dto.name !== undefined) updateData.name = dto.name;
            if (dto.shortName !== undefined) updateData.shortName = dto.shortName;
            if (dto.fullName !== undefined) updateData.fullName = dto.fullName;

            const updatedPortalMeasure = await this.repository.update(id, updateData);
            if (!updatedPortalMeasure) {
                throw new BadRequestException('Failed to update portal measure');
            }
            return this.mapToResponseDto(updatedPortalMeasure);
        } catch (error) {
            throw error;
        }
    }

    async delete(id: number): Promise<void> {
        const portalMeasure = await this.repository.findById(id);
        if (!portalMeasure) {
            throw new NotFoundException(`Portal measure with id ${id} not found`);
        }

        await this.repository.delete(id);
    }

    private mapToResponseDto(portalMeasure: portal_measure): PortalMeasureResponseDto {
        return {
            id: Number(portalMeasure.id),
            measure_id: Number(portalMeasure.measure_id),
            portal_id: Number(portalMeasure.portal_id),
            bitrixId: portalMeasure.bitrixId,
            name: portalMeasure.name,
            shortName: portalMeasure.shortName,
            fullName: portalMeasure.fullName,
            created_at: portalMeasure.created_at,
            updated_at: portalMeasure.updated_at,
        };
    }
}

