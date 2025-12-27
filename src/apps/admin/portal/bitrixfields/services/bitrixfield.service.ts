import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { bitrixfields } from 'generated/prisma';
import { BitrixFieldRepository } from '../repositories/bitrixfield.repository';
import { BitrixFieldItemRepository } from '../repositories/bitrixfield-item.repository';
import { CreateBitrixFieldDto } from '../dto/create-bitrixfield.dto';
import { UpdateBitrixFieldDto } from '../dto/update-bitrixfield.dto';
import { BitrixFieldResponseDto } from '../dto/bitrixfield-response.dto';
import { CreateBitrixFieldsBulkDto } from '../dto/create-bitrixfields-bulk.dto';
import { BitrixFieldItemResponseDto } from '../dto/bitrixfield-item-response.dto';

@Injectable()
export class BitrixFieldService {
    constructor(
        private readonly repository: BitrixFieldRepository,
        private readonly itemRepository: BitrixFieldItemRepository,
    ) {}

    async create(dto: CreateBitrixFieldDto): Promise<BitrixFieldResponseDto> {
        try {
            const field = await this.repository.create({
                entity_type: dto.entity_type,
                entity_id: BigInt(dto.entity_id),
                parent_type: dto.parent_type,
                type: dto.type,
                title: dto.title,
                name: dto.name,
                bitrixId: dto.bitrixId,
                bitrixCamelId: dto.bitrixCamelId,
                code: dto.code,
            });

            if (!field) {
                throw new BadRequestException('Failed to create field');
            }

            // Create items if provided
            if (dto.items && dto.items.length > 0) {
                await this.itemRepository.createMany(
                    dto.items.map(item => ({
                        bitrixfield_id: BigInt(field.id),
                        name: item.name,
                        title: item.title,
                        code: item.code,
                        bitrixId: item.bitrixId,
                    })),
                );
            }

            // Fetch field with items
            const fieldWithItems = await this.repository.findById(Number(field.id));
            return this.mapToResponseDto(fieldWithItems!);
        } catch (error) {
            throw error;
        }
    }

    async createBulk(dto: CreateBitrixFieldsBulkDto): Promise<BitrixFieldResponseDto[]> {
        const results: BitrixFieldResponseDto[] = [];

        for (const fieldDto of dto.fields) {
            const field = await this.create(fieldDto);
            results.push(field);
        }

        return results;
    }

    async findById(id: number): Promise<BitrixFieldResponseDto> {
        const field = await this.repository.findById(id);
        if (!field) {
            throw new NotFoundException(`Field with id ${id} not found`);
        }
        return this.mapToResponseDto(field);
    }

    async findMany(): Promise<BitrixFieldResponseDto[]> {
        const fields = await this.repository.findMany();
        if (!fields) {
            return [];
        }
        return fields.map(this.mapToResponseDto);
    }

    async findByEntity(entityType: string, entityId: number): Promise<BitrixFieldResponseDto[]> {
        const fields = await this.repository.findByEntity(entityType, entityId);
        if (!fields) {
            return [];
        }
        return fields.map(this.mapToResponseDto);
    }

    async findByEntityAndParentType(entityType: string, entityId: number, parentType: string): Promise<BitrixFieldResponseDto[]> {
        const fields = await this.repository.findByEntityAndParentType(entityType, entityId, parentType);
        if (!fields) {
            return [];
        }
        return fields.map(this.mapToResponseDto);
    }

    async update(id: number, dto: UpdateBitrixFieldDto): Promise<BitrixFieldResponseDto> {
        const field = await this.repository.findById(id);
        if (!field) {
            throw new NotFoundException(`Field with id ${id} not found`);
        }

        try {
            const updateData: Partial<bitrixfields> = {};
            if (dto.parent_type !== undefined) updateData.parent_type = dto.parent_type;
            if (dto.type !== undefined) updateData.type = dto.type;
            if (dto.title !== undefined) updateData.title = dto.title;
            if (dto.name !== undefined) updateData.name = dto.name;
            if (dto.bitrixId !== undefined) updateData.bitrixId = dto.bitrixId;
            if (dto.bitrixCamelId !== undefined) updateData.bitrixCamelId = dto.bitrixCamelId;
            if (dto.code !== undefined) updateData.code = dto.code;

            const updatedField = await this.repository.update(id, updateData);
            if (!updatedField) {
                throw new BadRequestException('Failed to update field');
            }
            return this.mapToResponseDto(updatedField);
        } catch (error) {
            throw error;
        }
    }

    async delete(id: number): Promise<void> {
        const field = await this.repository.findById(id);
        if (!field) {
            throw new NotFoundException(`Field with id ${id} not found`);
        }

        // Delete items first (cascade should handle this, but being explicit)
        await this.itemRepository.deleteByFieldId(id);
        await this.repository.delete(id);
    }

    private mapToResponseDto(field: bitrixfields): BitrixFieldResponseDto {
        return {
            id: Number(field.id),
            entity_type: field.entity_type,
            entity_id: Number(field.entity_id),
            parent_type: field.parent_type,
            type: field.type,
            title: field.title,
            name: field.name,
            bitrixId: field.bitrixId,
            bitrixCamelId: field.bitrixCamelId,
            code: field.code,
            items: (field as any).bitrixfield_items?.map((item: any) => ({
                id: Number(item.id),
                bitrixfield_id: Number(item.bitrixfield_id),
                name: item.name,
                title: item.title,
                code: item.code,
                bitrixId: item.bitrixId,
                created_at: item.created_at,
                updated_at: item.updated_at,
            })) || [],
            created_at: field.created_at,
            updated_at: field.updated_at,
        };
    }
}

