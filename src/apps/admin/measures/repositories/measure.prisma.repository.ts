import { Injectable } from '@nestjs/common';
import { measures } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { MeasureRepository } from './measure.repository';

@Injectable()
export class MeasurePrismaRepository implements MeasureRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(measure: Partial<measures>): Promise<measures | null> {
        const result = await this.prisma.measures.create({
            data: {
                name: measure.name!,
                shortName: measure.shortName!,
                fullName: measure.fullName!,
                code: measure.code!,
                type: measure.type,
            },
        });
        return result;
    }

    async findById(id: number): Promise<measures | null> {
        const result = await this.prisma.measures.findUnique({
            where: { id: BigInt(id) },
        });
        return result;
    }

    async findMany(): Promise<measures[] | null> {
        const result = await this.prisma.measures.findMany();
        return result;
    }

    async update(id: number, measure: Partial<measures>): Promise<measures | null> {
        const updateData: any = {};
        if (measure.name !== undefined) updateData.name = measure.name;
        if (measure.shortName !== undefined) updateData.shortName = measure.shortName;
        if (measure.fullName !== undefined) updateData.fullName = measure.fullName;
        if (measure.code !== undefined) updateData.code = measure.code;
        if (measure.type !== undefined) updateData.type = measure.type;

        const result = await this.prisma.measures.update({
            where: { id: BigInt(id) },
            data: updateData,
        });
        return result;
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.prisma.measures.delete({
            where: { id: BigInt(id) },
        });
        return result ? true : false;
    }
}

