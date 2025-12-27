import { Injectable } from '@nestjs/common';
import { bitrixfield_items } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { BitrixFieldItemRepository } from './bitrixfield-item.repository';

@Injectable()
export class BitrixFieldItemPrismaRepository implements BitrixFieldItemRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(item: Partial<bitrixfield_items>): Promise<bitrixfield_items | null> {
        const result = await this.prisma.bitrixfield_items.create({
            data: {
                bitrixfield_id: BigInt(item.bitrixfield_id!),
                name: item.name!,
                title: item.title!,
                code: item.code!,
                bitrixId: item.bitrixId!,
            },
        });
        return result;
    }

    async createMany(items: Partial<bitrixfield_items>[]): Promise<number> {
        const result = await this.prisma.bitrixfield_items.createMany({
            data: items.map(item => ({
                bitrixfield_id: BigInt(item.bitrixfield_id!),
                name: item.name!,
                title: item.title!,
                code: item.code!,
                bitrixId: item.bitrixId!,
            })),
        });
        return result.count;
    }

    async findById(id: number): Promise<bitrixfield_items | null> {
        const result = await this.prisma.bitrixfield_items.findUnique({
            where: { id: BigInt(id) },
        });
        return result;
    }

    async findByFieldId(fieldId: number): Promise<bitrixfield_items[] | null> {
        const result = await this.prisma.bitrixfield_items.findMany({
            where: { bitrixfield_id: BigInt(fieldId) },
        });
        return result;
    }

    async update(id: number, item: Partial<bitrixfield_items>): Promise<bitrixfield_items | null> {
        const updateData: any = {};
        if (item.name !== undefined) updateData.name = item.name;
        if (item.title !== undefined) updateData.title = item.title;
        if (item.code !== undefined) updateData.code = item.code;
        if (item.bitrixId !== undefined) updateData.bitrixId = item.bitrixId;

        const result = await this.prisma.bitrixfield_items.update({
            where: { id: BigInt(id) },
            data: updateData,
        });
        return result;
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.prisma.bitrixfield_items.delete({
            where: { id: BigInt(id) },
        });
        return result ? true : false;
    }

    async deleteByFieldId(fieldId: number): Promise<number> {
        const result = await this.prisma.bitrixfield_items.deleteMany({
            where: { bitrixfield_id: BigInt(fieldId) },
        });
        return result.count;
    }
}

