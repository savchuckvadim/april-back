import { Injectable } from '@nestjs/common';
import { btx_categories, Prisma } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { BtxCategoryRepository } from './btx-category.repository';
import { getPbxCategoryEntity } from '../lib/portal-category-entity.util';
import { PortalCategoryEntity } from '../entity/portal-category.entity';

@Injectable()
export class BtxCategoryPrismaRepository implements BtxCategoryRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(
        category: Partial<btx_categories>,
    ): Promise<PortalCategoryEntity | null> {
        const result = await this.prisma.btx_categories.create({
            data: {
                entity_type: category.entity_type!,
                entity_id: BigInt(category.entity_id!),
                parent_type: category.parent_type!,
                type: category.type!,
                group: category.group!,
                title: category.title!,
                name: category.name!,
                bitrixId: category.bitrixId!,
                bitrixCamelId: category.bitrixCamelId!,
                code: category.code!,
                isActive: category.isActive!,
            },
            include: {
                btx_stages: true,
            },
        });
        return getPbxCategoryEntity(result);
    }

    async findById(id: number): Promise<PortalCategoryEntity | null> {
        const result = await this.prisma.btx_categories.findUnique({
            where: { id: BigInt(id) },
            include: {
                btx_stages: true,
            },
        });
        return result ? getPbxCategoryEntity(result) : null;
    }

    async findMany(): Promise<PortalCategoryEntity[] | null> {
        const result = await this.prisma.btx_categories.findMany({
            include: {
                btx_stages: true,
            },
        });
        return result.map(row => getPbxCategoryEntity(row));
    }

    async findByEntity(
        entityType: string,
        entityId: number,
    ): Promise<PortalCategoryEntity[] | null> {
        const result = await this.prisma.btx_categories.findMany({
            where: {
                entity_type: entityType,
                entity_id: BigInt(entityId),
            },
            include: {
                btx_stages: true,
            },
        });
        return result.map(row => getPbxCategoryEntity(row));
    }

    async findByEntityAndParentType(
        entityType: string,
        entityId: number,
        parentType: string,
    ): Promise<PortalCategoryEntity[] | null> {
        const result = await this.prisma.btx_categories.findMany({
            where: {
                entity_type: entityType,
                entity_id: BigInt(entityId),
                parent_type: parentType,
            },
            include: {
                btx_stages: true,
            },
        });
        return result.map(row => getPbxCategoryEntity(row));
    }

    async update(
        id: number,
        category: Partial<btx_categories>,
    ): Promise<PortalCategoryEntity | null> {
        const updateData: Prisma.btx_categoriesUpdateInput = {};
        if (category.entity_type !== undefined)
            updateData.entity_type = category.entity_type;
        if (category.entity_id !== undefined)
            updateData.entity_id = BigInt(category.entity_id);
        if (category.parent_type !== undefined)
            updateData.parent_type = category.parent_type;
        if (category.type !== undefined) updateData.type = category.type;
        if (category.group !== undefined) updateData.group = category.group;
        if (category.title !== undefined) updateData.title = category.title;
        if (category.name !== undefined) updateData.name = category.name;
        if (category.bitrixId !== undefined)
            updateData.bitrixId = category.bitrixId;
        if (category.bitrixCamelId !== undefined)
            updateData.bitrixCamelId = category.bitrixCamelId;
        if (category.code !== undefined) updateData.code = category.code;
        if (category.isActive !== undefined)
            updateData.isActive = category.isActive;

        const result = await this.prisma.btx_categories.update({
            where: { id: BigInt(id) },
            data: updateData,
            include: {
                btx_stages: true,
            },
        });
        return getPbxCategoryEntity(result);
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.prisma.btx_categories.delete({
            where: { id: BigInt(id) },
        });
        return result ? true : false;
    }
}
