import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { measures } from 'generated/prisma';
import { MeasureRepository } from '../repositories/measure.repository';
import { CreateMeasureDto } from '../dto/create-measure.dto';
import { UpdateMeasureDto } from '../dto/update-measure.dto';
import { MeasureResponseDto } from '../dto/measure-response.dto';

@Injectable()
export class MeasureService {
    constructor(private readonly repository: MeasureRepository) { }

    async create(dto: CreateMeasureDto): Promise<MeasureResponseDto> {
        try {
            const measure = await this.repository.create({
                name: dto.name,
                shortName: dto.shortName,
                fullName: dto.fullName,
                code: dto.code,
                type: dto.type,
            });

            if (!measure) {
                throw new BadRequestException('Failed to create measure');
            }

            return this.mapToResponseDto(measure);
        } catch (error) {
            throw error;
        }
    }

    async findById(id: number): Promise<MeasureResponseDto> {
        const measure = await this.repository.findById(id);
        if (!measure) {
            throw new NotFoundException(`Measure with id ${id} not found`);
        }
        return this.mapToResponseDto(measure);
    }

    async findMany(): Promise<MeasureResponseDto[]> {
        const measures = await this.repository.findMany();
        if (!measures) {
            return [];
        }
        return measures.map(this.mapToResponseDto);
    }

    async update(id: number, dto: UpdateMeasureDto): Promise<MeasureResponseDto> {
        const measure = await this.repository.findById(id);
        if (!measure) {
            throw new NotFoundException(`Measure with id ${id} not found`);
        }

        try {
            const updateData: Partial<measures> = {};
            if (dto.name !== undefined) updateData.name = dto.name;
            if (dto.shortName !== undefined) updateData.shortName = dto.shortName;
            if (dto.fullName !== undefined) updateData.fullName = dto.fullName;
            if (dto.code !== undefined) updateData.code = dto.code;
            if (dto.type !== undefined) updateData.type = dto.type;

            const updatedMeasure = await this.repository.update(id, updateData);
            if (!updatedMeasure) {
                throw new BadRequestException('Failed to update measure');
            }
            return this.mapToResponseDto(updatedMeasure);
        } catch (error) {
            throw error;
        }
    }

    async delete(id: number): Promise<void> {
        const measure = await this.repository.findById(id);
        if (!measure) {
            throw new NotFoundException(`Measure with id ${id} not found`);
        }

        await this.repository.delete(id);
    }

    private mapToResponseDto(measure: measures): MeasureResponseDto {
        return {
            id: Number(measure.id),
            name: measure.name,
            shortName: measure.shortName,
            fullName: measure.fullName,
            code: measure.code,
            type: measure.type,
            created_at: measure.created_at,
            updated_at: measure.updated_at,
        };
    }
}

