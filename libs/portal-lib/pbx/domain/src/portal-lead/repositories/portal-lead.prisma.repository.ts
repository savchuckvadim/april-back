import { Injectable } from '@nestjs/common';
import type { btx_leads } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { PortalLeadRepository } from './portal-lead.repository';

@Injectable()
export class PortalLeadPrismaRepository implements PortalLeadRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(
        data: Pick<btx_leads, 'name' | 'title' | 'code' | 'portal_id'>,
    ): Promise<btx_leads> {
        return this.prisma.btx_leads.create({ data });
    }

    async findById(id: number): Promise<btx_leads | null> {
        return this.prisma.btx_leads.findUnique({
            where: { id: BigInt(id) },
            include: {
                portals: true,
            },
        });
    }

    async findFirstByPortalId(portalId: number): Promise<btx_leads | null> {
        return this.prisma.btx_leads.findFirst({
            where: { portal_id: BigInt(portalId) },
        });
    }

    async findMany(): Promise<btx_leads[]> {
        return this.prisma.btx_leads.findMany({
            orderBy: { id: 'asc' },
        });
    }

    async update(
        id: number,
        data: Partial<Pick<btx_leads, 'name' | 'title' | 'code' | 'portal_id'>>,
    ): Promise<btx_leads> {
        return this.prisma.btx_leads.update({
            where: { id: BigInt(id) },
            data,
        });
    }

    async delete(id: number): Promise<void> {
        await this.prisma.btx_leads.delete({
            where: { id: BigInt(id) },
        });
    }
}
