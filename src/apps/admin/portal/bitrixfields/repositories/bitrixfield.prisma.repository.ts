import { Injectable } from '@nestjs/common';
import { bitrixfields } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { BitrixFieldRepository } from './bitrixfield.repository';

@Injectable()
export class BitrixFieldPrismaRepository implements BitrixFieldRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(field: Partial<bitrixfields>): Promise<bitrixfields | null> {
        const result = await this.prisma.bitrixfields.create({
            data: {
                entity_type: field.entity_type!,
                entity_id: BigInt(field.entity_id!),
                parent_type: field.parent_type!,
                type: field.type!,
                title: field.title!,
                name: field.name!,
                bitrixId: field.bitrixId!,
                bitrixCamelId: field.bitrixCamelId!,
                code: field.code!,
            },
            include: {
                bitrixfield_items: true,
            },
        });
        return result;
    }

    async findById(id: number): Promise<bitrixfields | null> {
        const result = await this.prisma.bitrixfields.findUnique({
            where: { id: BigInt(id) },
            include: {
                bitrixfield_items: true,
            },
        });
        return result;
    }

    async findMany(): Promise<bitrixfields[] | null> {
        const result = await this.prisma.bitrixfields.findMany({
            include: {
                bitrixfield_items: true,
            },
        });
        return result;
    }

    async findByEntity(entityType: string, entityId: number): Promise<bitrixfields[] | null> {
        const result = await this.prisma.bitrixfields.findMany({
            where: {
                entity_type: entityType,
                entity_id: BigInt(entityId),
            },
            include: {
                bitrixfield_items: true,
            },
        });
        return result;
    }

    async findByEntityAndParentType(entityType: string, entityId: number, parentType: string): Promise<bitrixfields[] | null> {
        const result = await this.prisma.bitrixfields.findMany({
            where: {
                entity_type: entityType,
                entity_id: BigInt(entityId),
                parent_type: parentType,
            },
            include: {
                bitrixfield_items: true,
            },
        });
        return result;
    }

    async update(id: number, field: Partial<bitrixfields>): Promise<bitrixfields | null> {
        const updateData: any = {};
        if (field.entity_type !== undefined) updateData.entity_type = field.entity_type;
        if (field.entity_id !== undefined) updateData.entity_id = BigInt(field.entity_id);
        if (field.parent_type !== undefined) updateData.parent_type = field.parent_type;
        if (field.type !== undefined) updateData.type = field.type;
        if (field.title !== undefined) updateData.title = field.title;
        if (field.name !== undefined) updateData.name = field.name;
        if (field.bitrixId !== undefined) updateData.bitrixId = field.bitrixId;
        if (field.bitrixCamelId !== undefined) updateData.bitrixCamelId = field.bitrixCamelId;
        if (field.code !== undefined) updateData.code = field.code;

        const result = await this.prisma.bitrixfields.update({
            where: { id: BigInt(id) },
            data: updateData,
            include: {
                bitrixfield_items: true,
            },
        });
        return result;
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.prisma.bitrixfields.delete({
            where: { id: BigInt(id) },
        });
        return result ? true : false;
    }
}

