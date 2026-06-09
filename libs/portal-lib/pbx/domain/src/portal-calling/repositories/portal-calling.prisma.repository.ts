import { Injectable } from '@nestjs/common';
import type { callings } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { PortalCallingRepository } from './portal-calling.repository';
import type { PortalCallingWritable } from '../utils/portal-calling-entity.util';

@Injectable()
export class PortalCallingPrismaRepository implements PortalCallingRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(data: PortalCallingWritable): Promise<callings> {
        return this.prisma.callings.create({ data });
    }

    async findById(id: number): Promise<callings | null> {
        return this.prisma.callings.findUnique({
            where: { id: BigInt(id) },
        });
    }

    async findByTypeGroupPortal(
        type: string,
        group: string,
        portalId: number,
    ): Promise<callings | null> {
        return this.prisma.callings.findFirst({
            where: {
                type,
                group,
                portal_id: BigInt(portalId),
            },
        });
    }

    async findByPortalId(portalId: number): Promise<callings[]> {
        return this.prisma.callings.findMany({
            where: { portal_id: BigInt(portalId) },
            orderBy: { id: 'asc' },
        });
    }

    async findMany(): Promise<callings[]> {
        return this.prisma.callings.findMany({
            orderBy: { id: 'asc' },
        });
    }

    async update(
        id: number,
        data: Partial<PortalCallingWritable>,
    ): Promise<callings> {
        return this.prisma.callings.update({
            where: { id: BigInt(id) },
            data,
        });
    }

    async delete(id: number): Promise<void> {
        await this.prisma.callings.delete({
            where: { id: BigInt(id) },
        });
    }
}
