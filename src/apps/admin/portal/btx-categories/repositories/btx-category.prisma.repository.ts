import { Injectable } from '@nestjs/common';
import { btx_categories } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { BtxCategoryRepository } from './btx-category.repository';

@Injectable()
export class BtxCategoryPrismaRepository implements BtxCategoryRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(category: Partial<btx_categories>): Promise<btx_categories | null> {
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
        return result;
    }

    async findById(id: number): Promise<btx_categories | null> {
        const result = await this.prisma.btx_categories.findUnique({
            where: { id: BigInt(id) },
            include: {
                btx_stages: true,
            },
        });
        return result;
    }

    async findMany(): Promise<btx_categories[] | null> {
        const result = await this.prisma.btx_categories.findMany({
            include: {
                btx_stages: true,
            },
        });
        return result;
    }

    async findByEntity(entityType: string, entityId: number): Promise<btx_categories[] | null> {
        const result = await this.prisma.btx_categories.findMany({
            where: {
                entity_type: entityType,
                entity_id: BigInt(entityId),
            },
            include: {
                btx_stages: true,
            },
        });
        return result;
    }

    async findByEntityAndParentType(entityType: string, entityId: number, parentType: string): Promise<btx_categories[] | null> {
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
        return result;
    }

    async update(id: number, category: Partial<btx_categories>): Promise<btx_categories | null> {
        const updateData: any = {};
        if (category.entity_type !== undefined) updateData.entity_type = category.entity_type;
        if (category.entity_id !== undefined) updateData.entity_id = BigInt(category.entity_id);
        if (category.parent_type !== undefined) updateData.parent_type = category.parent_type;
        if (category.type !== undefined) updateData.type = category.type;
        if (category.group !== undefined) updateData.group = category.group;
        if (category.title !== undefined) updateData.title = category.title;
        if (category.name !== undefined) updateData.name = category.name;
        if (category.bitrixId !== undefined) updateData.bitrixId = category.bitrixId;
        if (category.bitrixCamelId !== undefined) updateData.bitrixCamelId = category.bitrixCamelId;
        if (category.code !== undefined) updateData.code = category.code;
        if (category.isActive !== undefined) updateData.isActive = category.isActive;

        const result = await this.prisma.btx_categories.update({
            where: { id: BigInt(id) },
            data: updateData,
            include: {
                btx_stages: true,
            },
        });
        return result;
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.prisma.btx_categories.delete({
            where: { id: BigInt(id) },
        });
        return result ? true : false;
    }
}

