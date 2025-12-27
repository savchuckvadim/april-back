import { Injectable } from '@nestjs/common';
import { Client } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { ClientRepository } from './client.repository';
import { ClientWithRelations } from '../entity/client.entity';
import { createPortalEntityFromPrisma } from '@/modules/portal-konstructor/portal/lib/portal-entity.util';

@Injectable()
export class ClientPrismaRepository implements ClientRepository {
    constructor(private readonly prisma: PrismaService) { }

    async create(client: Partial<Client>): Promise<Client | null> {
        const result = await this.prisma.client.create({
            data: {
                name: client.name!,
                email: client.email,
                status: client.status,
                is_active: client.is_active ?? true,
            },
        });
        return result;
    }

    async findById(id: number): Promise<Client | null> {
        const result = await this.prisma.client.findUnique({
            where: { id: BigInt(id) },
            include: {
                users: true,
                portals: true,

            },
        });

        if (!result) return null;
        return result;
    }

    async findByIdWithRelations(id: number): Promise<ClientWithRelations | null> {
        const result = await this.prisma.client.findUnique({
            where: { id: BigInt(id) },
            include: {
                users: true,
                portals: true,
            },
        });

        if (!result) return null;
        const portal = await this.prisma.portal.findFirst({
            where: { client_id: BigInt(id) },
            include: {
                agents: true,
                templates: true,
            },
        });
        return { ...result, portal };
    }


    async findMany(): Promise<Client[] | null> {
        const result = await this.prisma.client.findMany({
            include: {
                users: true,
                portals: true,
            },
        });
        if (!result) return null;
        return result;
    }

    async findByEmail(email: string): Promise<Client | null> {
        const result = await this.prisma.client.findUnique({
            where: { email: email },
        });
        return result;
    }

    async findByStatus(status: string): Promise<Client[] | null> {
        const result = await this.prisma.client.findMany({
            where: { status: status },
        });
        return result;
    }

    async findByIsActive(isActive: boolean): Promise<Client[] | null> {
        const result = await this.prisma.client.findMany({
            where: { is_active: isActive },
        });
        return result;
    }

    async findByUserId(userId: number): Promise<Client[] | null> {
        const result = await this.prisma.client.findMany({
            where: { users: { some: { id: BigInt(userId) } } },
        });
        return result;
    }

    async findByPortalId(portalId: number): Promise<Client[] | null> {
        const result = await this.prisma.client.findMany({
            where: { portals: { some: { id: BigInt(portalId) } } },
        });
        return result;
    }

    async update(id: number, client: Partial<Client>): Promise<Client | null> {
        const result = await this.prisma.client.update({
            where: { id: BigInt(id) },
            data: client,
        });
        return result;
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.prisma.client.delete({
            where: { id: BigInt(id) },
        });
        return result ? true : false;
    }
}

