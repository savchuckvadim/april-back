import { Injectable } from '@nestjs/common';
import type { btx_contacts } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { PortalContactRepository } from './portal-contact.repository';

@Injectable()
export class PortalContactPrismaRepository implements PortalContactRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(
        data: Pick<btx_contacts, 'name' | 'title' | 'code' | 'portal_id'>,
    ): Promise<btx_contacts> {
        return this.prisma.btx_contacts.create({ data });
    }

    async findById(id: number): Promise<btx_contacts | null> {
        return this.prisma.btx_contacts.findUnique({
            where: { id: BigInt(id) },
            include: {
                portals: true,
            },
        });
    }

    async findFirstByPortalId(portalId: number): Promise<btx_contacts | null> {
        return this.prisma.btx_contacts.findFirst({
            where: { portal_id: BigInt(portalId) },
        });
    }

    async findMany(): Promise<btx_contacts[]> {
        return this.prisma.btx_contacts.findMany({
            orderBy: { id: 'asc' },
        });
    }

    async update(
        id: number,
        data: Partial<
            Pick<btx_contacts, 'name' | 'title' | 'code' | 'portal_id'>
        >,
    ): Promise<btx_contacts> {
        return this.prisma.btx_contacts.update({
            where: { id: BigInt(id) },
            data,
        });
    }

    async delete(id: number): Promise<void> {
        await this.prisma.btx_contacts.delete({
            where: { id: BigInt(id) },
        });
    }
}
