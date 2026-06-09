import { Injectable } from '@nestjs/common';
import type { departaments } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { PortalDepartamentRepository } from './portal-departament.repository';
import type { PortalDepartamentWritable } from '../utils/portal-departament-entity.util';

@Injectable()
export class PortalDepartamentPrismaRepository
    implements PortalDepartamentRepository
{
    constructor(private readonly prisma: PrismaService) {}

    async create(data: PortalDepartamentWritable): Promise<departaments> {
        return this.prisma.departaments.create({ data });
    }

    async findById(id: number): Promise<departaments | null> {
        return this.prisma.departaments.findUnique({
            where: { id: BigInt(id) },
        });
    }

    async findByTypeGroupPortal(
        type: string,
        group: string,
        portalId: number,
    ): Promise<departaments | null> {
        return this.prisma.departaments.findFirst({
            where: {
                type,
                group,
                portal_id: BigInt(portalId),
            },
        });
    }

    async findByPortalId(portalId: number): Promise<departaments[]> {
        return this.prisma.departaments.findMany({
            where: { portal_id: BigInt(portalId) },
            orderBy: { id: 'asc' },
        });
    }

    async findMany(): Promise<departaments[]> {
        return this.prisma.departaments.findMany({
            orderBy: { id: 'asc' },
        });
    }

    async update(
        id: number,
        data: Partial<PortalDepartamentWritable>,
    ): Promise<departaments> {
        return this.prisma.departaments.update({
            where: { id: BigInt(id) },
            data,
        });
    }

    async delete(id: number): Promise<void> {
        await this.prisma.departaments.delete({
            where: { id: BigInt(id) },
        });
    }
}
