import { Injectable } from '@nestjs/common';
import type { btx_companies } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { PortalCompanyRepository } from './portal-company.repository';

@Injectable()
export class PortalCompanyPrismaRepository implements PortalCompanyRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(
        data: Pick<btx_companies, 'name' | 'title' | 'code' | 'portal_id'>,
    ): Promise<btx_companies> {
        return this.prisma.btx_companies.create({ data });
    }

    async findById(id: number): Promise<btx_companies | null> {
        return this.prisma.btx_companies.findUnique({
            where: { id: BigInt(id) },
            include: {
                portals: true,
            },
        });
    }

    async findFirstByPortalId(portalId: number): Promise<btx_companies | null> {
        return this.prisma.btx_companies.findFirst({
            where: { portal_id: BigInt(portalId) },
        });
    }

    async findMany(): Promise<btx_companies[]> {
        return this.prisma.btx_companies.findMany({
            orderBy: { id: 'asc' },
        });
    }

    async update(
        id: number,
        data: Partial<
            Pick<btx_companies, 'name' | 'title' | 'code' | 'portal_id'>
        >,
    ): Promise<btx_companies> {
        return this.prisma.btx_companies.update({
            where: { id: BigInt(id) },
            data,
        });
    }

    async delete(id: number): Promise<void> {
        await this.prisma.btx_companies.delete({
            where: { id: BigInt(id) },
        });
    }
}
