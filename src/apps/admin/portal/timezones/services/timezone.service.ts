import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { timezones } from 'generated/prisma';
import { TimezoneRepository } from '../repositories/timezone.repository';
import { CreateTimezoneDto } from '../dto/create-timezone.dto';
import { UpdateTimezoneDto } from '../dto/update-timezone.dto';
import { TimezoneResponseDto } from '../dto/timezone-response.dto';

@Injectable()
export class TimezoneService {
    constructor(private readonly repository: TimezoneRepository) { }

    async create(dto: CreateTimezoneDto): Promise<TimezoneResponseDto> {
        try {
            const timezone = await this.repository.create({
                name: dto.name,
                title: dto.title,
                value: dto.value,
                portal_id: BigInt(dto.portal_id),
                type: dto.type,
                offset: dto.offset,
            });

            if (!timezone) {
                throw new BadRequestException('Failed to create timezone');
            }

            return this.mapToResponseDto(timezone);
        } catch (error) {
            throw error;
        }
    }

    async findById(id: number): Promise<TimezoneResponseDto> {
        const timezone = await this.repository.findById(id);
        if (!timezone) {
            throw new NotFoundException(`Timezone with id ${id} not found`);
        }
        return this.mapToResponseDto(timezone);
    }

    async findMany(): Promise<TimezoneResponseDto[]> {
        const timezones = await this.repository.findMany();
        if (!timezones) {
            return [];
        }
        return timezones.map(this.mapToResponseDto);
    }

    async findByPortalId(portalId: number): Promise<TimezoneResponseDto[]> {
        const timezones = await this.repository.findByPortalId(portalId);
        if (!timezones) {
            return [];
        }
        return timezones.map(this.mapToResponseDto);
    }

    async update(id: number, dto: UpdateTimezoneDto): Promise<TimezoneResponseDto> {
        const timezone = await this.repository.findById(id);
        if (!timezone) {
            throw new NotFoundException(`Timezone with id ${id} not found`);
        }

        try {
            const updateData: Partial<timezones> = {};
            if (dto.name !== undefined) updateData.name = dto.name;
            if (dto.title !== undefined) updateData.title = dto.title;
            if (dto.value !== undefined) updateData.value = dto.value;
            if (dto.portal_id !== undefined) updateData.portal_id = BigInt(dto.portal_id);
            if (dto.type !== undefined) updateData.type = dto.type;
            if (dto.offset !== undefined) updateData.offset = dto.offset;

            const updatedTimezone = await this.repository.update(id, updateData);
            if (!updatedTimezone) {
                throw new BadRequestException('Failed to update timezone');
            }
            return this.mapToResponseDto(updatedTimezone);
        } catch (error) {
            throw error;
        }
    }

    async delete(id: number): Promise<void> {
        const timezone = await this.repository.findById(id);
        if (!timezone) {
            throw new NotFoundException(`Timezone with id ${id} not found`);
        }

        await this.repository.delete(id);
    }

    private mapToResponseDto(timezone: timezones): TimezoneResponseDto {
        return {
            id: Number(timezone.id),
            name: timezone.name,
            title: timezone.title,
            value: timezone.value,
            portal_id: Number(timezone.portal_id),
            type: timezone.type,
            offset: timezone.offset,
        };
    }
}

