import { Injectable } from '@nestjs/common';
import type { btx_deals } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { PortalDealRepository } from './portal-deal.repository';

@Injectable()
export class PortalDealPrismaRepository implements PortalDealRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(
        data: Pick<btx_deals, 'name' | 'title' | 'code' | 'portal_id'>,
    ): Promise<btx_deals> {
        return this.prisma.btx_deals.create({ data });
    }

    async findById(id: number): Promise<btx_deals | null> {
        return this.prisma.btx_deals.findUnique({
            where: { id: BigInt(id) },
            include: {
                portals: true,
            },
        });
    }

    async findFirstByPortalId(portalId: number): Promise<btx_deals | null> {
        return this.prisma.btx_deals.findFirst({
            where: { portal_id: BigInt(portalId) },
        });
    }

    async findMany(): Promise<btx_deals[]> {
        return this.prisma.btx_deals.findMany({
            orderBy: { id: 'asc' },
        });
    }

    async update(
        id: number,
        data: Partial<Pick<btx_deals, 'name' | 'title' | 'code' | 'portal_id'>>,
    ): Promise<btx_deals> {
        return this.prisma.btx_deals.update({
            where: { id: BigInt(id) },
            data,
        });
    }

    async delete(id: number): Promise<void> {
        await this.prisma.btx_deals.delete({
            where: { id: BigInt(id) },
        });
    }
}
