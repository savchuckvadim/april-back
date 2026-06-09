import { Injectable } from '@nestjs/common';
import type { bx_rqs } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { PortalRqRepository } from './portal-rq.repository';
import type { PortalRqWritable } from '../utils/portal-rq-entity.util';

@Injectable()
export class PortalRqPrismaRepository implements PortalRqRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(data: PortalRqWritable): Promise<bx_rqs> {
        return this.prisma.bx_rqs.create({ data });
    }

    async findById(id: number): Promise<bx_rqs | null> {
        return this.prisma.bx_rqs.findUnique({
            where: { id: BigInt(id) },
        });
    }

    async findByCodePortal(
        code: string,
        portalId: number,
    ): Promise<bx_rqs | null> {
        return this.prisma.bx_rqs.findFirst({
            where: {
                code,
                portal_id: BigInt(portalId),
            },
        });
    }

    async findByPortalId(portalId: number): Promise<bx_rqs[]> {
        return this.prisma.bx_rqs.findMany({
            where: { portal_id: BigInt(portalId) },
            orderBy: { sort: 'asc' },
        });
    }

    async findMany(): Promise<bx_rqs[]> {
        return this.prisma.bx_rqs.findMany({
            orderBy: { id: 'asc' },
        });
    }

    async update(id: number, data: Partial<PortalRqWritable>): Promise<bx_rqs> {
        return this.prisma.bx_rqs.update({
            where: { id: BigInt(id) },
            data,
        });
    }

    async delete(id: number): Promise<void> {
        await this.prisma.bx_rqs.delete({
            where: { id: BigInt(id) },
        });
    }
}
