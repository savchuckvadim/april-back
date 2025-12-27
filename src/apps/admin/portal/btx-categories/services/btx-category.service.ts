import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { btx_categories } from 'generated/prisma';
import { BtxCategoryRepository } from '../repositories/btx-category.repository';
import { BtxStageRepository } from '../repositories/btx-stage.repository';
import { CreateBtxCategoryDto } from '../dto/create-btx-category.dto';
import { UpdateBtxCategoryDto } from '../dto/update-btx-category.dto';
import { BtxCategoryResponseDto } from '../dto/btx-category-response.dto';

@Injectable()
export class BtxCategoryService {
    constructor(
        private readonly repository: BtxCategoryRepository,
        private readonly stageRepository: BtxStageRepository,
    ) { }

    async create(dto: CreateBtxCategoryDto): Promise<BtxCategoryResponseDto> {
        try {
            const category = await this.repository.create({
                entity_type: dto.entity_type,
                entity_id: BigInt(dto.entity_id),
                parent_type: dto.parent_type,
                type: dto.type,
                group: dto.group,
                title: dto.title,
                name: dto.name,
                bitrixId: dto.bitrixId,
                bitrixCamelId: dto.bitrixCamelId,
                code: dto.code,
                isActive: dto.isActive,
            });

            if (!category) {
                throw new BadRequestException('Failed to create category');
            }

            // Create stages if provided
            if (dto.stages && dto.stages.length > 0) {
                await this.stageRepository.createMany(
                    dto.stages.map(stage => ({
                        btx_category_id: BigInt(category.id!),
                        name: stage.name,
                        title: stage.title,
                        code: stage.code,
                        bitrixId: stage.bitrixId.toString(),
                        color: stage.color,
                        isActive: stage.isActive,
                    })),
                );
            }

            // Fetch category with stages
            const categoryWithStages = await this.repository.findById(Number(category.id));
            return this.mapToResponseDto(categoryWithStages!);
        } catch (error) {
            throw error;
        }
    }

    async findById(id: number): Promise<BtxCategoryResponseDto> {
        const category = await this.repository.findById(id);
        if (!category) {
            throw new NotFoundException(`Category with id ${id} not found`);
        }
        return this.mapToResponseDto(category);
    }

    async findMany(): Promise<BtxCategoryResponseDto[]> {
        const categories = await this.repository.findMany();
        if (!categories) {
            return [];
        }
        return categories.map(this.mapToResponseDto);
    }

    async findByEntity(entityType: string, entityId: number): Promise<BtxCategoryResponseDto[]> {
        const categories = await this.repository.findByEntity(entityType, entityId);
        if (!categories) {
            return [];
        }
        return categories.map(this.mapToResponseDto);
    }

    async findByEntityAndParentType(entityType: string, entityId: number, parentType: string): Promise<BtxCategoryResponseDto[]> {
        const categories = await this.repository.findByEntityAndParentType(entityType, entityId, parentType);
        if (!categories) {
            return [];
        }
        return categories.map(this.mapToResponseDto);
    }

    async update(id: number, dto: UpdateBtxCategoryDto): Promise<BtxCategoryResponseDto> {
        const category = await this.repository.findById(id);
        if (!category) {
            throw new NotFoundException(`Category with id ${id} not found`);
        }

        try {
            const updateData: Partial<btx_categories> = {};
            if (dto.parent_type !== undefined) updateData.parent_type = dto.parent_type;
            if (dto.type !== undefined) updateData.type = dto.type;
            if (dto.group !== undefined) updateData.group = dto.group;
            if (dto.title !== undefined) updateData.title = dto.title;
            if (dto.name !== undefined) updateData.name = dto.name;
            if (dto.bitrixId !== undefined) updateData.bitrixId = dto.bitrixId;
            if (dto.bitrixCamelId !== undefined) updateData.bitrixCamelId = dto.bitrixCamelId;
            if (dto.code !== undefined) updateData.code = dto.code;
            if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

            const updatedCategory = await this.repository.update(id, updateData);
            if (!updatedCategory) {
                throw new BadRequestException('Failed to update category');
            }
            return this.mapToResponseDto(updatedCategory);
        } catch (error) {
            throw error;
        }
    }

    async delete(id: number): Promise<void> {
        const category = await this.repository.findById(id);
        if (!category) {
            throw new NotFoundException(`Category with id ${id} not found`);
        }

        // Delete stages first (cascade should handle this, but being explicit)
        await this.stageRepository.deleteByCategoryId(id);
        await this.repository.delete(id);
    }

    private mapToResponseDto(category: btx_categories): BtxCategoryResponseDto {
        return {
            id: Number(category.id),
            entity_type: category.entity_type,
            entity_id: Number(category.entity_id),
            parent_type: category.parent_type,
            type: category.type,
            group: category.group,
            title: category.title,
            name: category.name,
            bitrixId: category.bitrixId,
            bitrixCamelId: category.bitrixCamelId,
            code: category.code,
            isActive: category.isActive,
            stages: (category as any).btx_stages?.map((stage: any) => ({
                id: Number(stage.id),
                btx_category_id: Number(stage.btx_category_id),
                name: stage.name,
                title: stage.title,
                code: stage.code,
                bitrixId: stage.bitrixId,
                color: stage.color,
                isActive: stage.isActive,
                created_at: stage.created_at,
                updated_at: stage.updated_at,
            })) || [],
            created_at: category.created_at,
            updated_at: category.updated_at,
        };
    }
}

