import { Injectable } from '@nestjs/common';
import { btx_stages } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { BtxStageRepository } from './btx-stage.repository';

@Injectable()
export class BtxStagePrismaRepository implements BtxStageRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(stage: Partial<btx_stages>): Promise<btx_stages | null> {
        const result = await this.prisma.btx_stages.create({
            data: {
                btx_category_id: BigInt(stage.btx_category_id!),
                name: stage.name!,
                title: stage.title!,
                code: stage.code!,
                bitrixId: stage.bitrixId!,
                color: stage.color!,
                isActive: stage.isActive!,
            },
        });
        return result;
    }

    async createMany(stages: Partial<btx_stages>[]): Promise<number> {
        const result = await this.prisma.btx_stages.createMany({
            data: stages.map(stage => ({
                btx_category_id: BigInt(stage.btx_category_id!),
                name: stage.name!,
                title: stage.title!,
                code: stage.code!,
                bitrixId: stage.bitrixId!,
                color: stage.color!,
                isActive: stage.isActive!,
            })),
        });
        return result.count;
    }

    async findById(id: number): Promise<btx_stages | null> {
        const result = await this.prisma.btx_stages.findUnique({
            where: { id: BigInt(id) },
        });
        return result;
    }

    async findByCategoryId(categoryId: number): Promise<btx_stages[] | null> {
        const result = await this.prisma.btx_stages.findMany({
            where: { btx_category_id: BigInt(categoryId) },
        });
        return result;
    }

    async update(id: number, stage: Partial<btx_stages>): Promise<btx_stages | null> {
        const updateData: any = {};
        if (stage.name !== undefined) updateData.name = stage.name;
        if (stage.title !== undefined) updateData.title = stage.title;
        if (stage.code !== undefined) updateData.code = stage.code;
        if (stage.bitrixId !== undefined) updateData.bitrixId = stage.bitrixId;
        if (stage.color !== undefined) updateData.color = stage.color;
        if (stage.isActive !== undefined) updateData.isActive = stage.isActive;

        const result = await this.prisma.btx_stages.update({
            where: { id: BigInt(id) },
            data: updateData,
        });
        return result;
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.prisma.btx_stages.delete({
            where: { id: BigInt(id) },
        });
        return result ? true : false;
    }

    async deleteByCategoryId(categoryId: number): Promise<number> {
        const result = await this.prisma.btx_stages.deleteMany({
            where: { btx_category_id: BigInt(categoryId) },
        });
        return result.count;
    }
}

