import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { PortalRepository } from './portal.repository';
import { PortalEntity } from './portal.entity';
import { createPortalEntityFromPrisma, PortalWithRelations } from './lib/portal-entity.util';
import { Prisma } from 'generated/prisma';

@Injectable()
export class PortalPrismaRepository implements PortalRepository {
    constructor(private readonly prisma: PrismaService) { }

    async create(portal: Partial<PortalEntity>): Promise<PortalEntity | null> {
        const allPortalsCount: number = await this.prisma.portal.count();
        const result = await this.prisma.portal.create({
            data: {

                created_at: new Date(),
                updated_at: new Date(),
                number: allPortalsCount + 1,
                C_REST_CLIENT_ID: portal.cRestClientId!,
                C_REST_CLIENT_SECRET: portal.cRestClientSecret!,
                C_REST_WEB_HOOK_URL: portal.cRestWebHookUrl!,
                domain: portal.domain!,
                key: portal.key!,
                client_id: BigInt(portal.clientId!),


            },
        });
        return createPortalEntityFromPrisma(result);
    }
    async update(portal: Partial<PortalEntity>): Promise<PortalEntity | null> {
        const data: Prisma.PortalUpdateInput = {
            updated_at: new Date(),
        };

        if (portal.domain !== undefined) {
            data.domain = portal.domain;
        }

        if (portal.key !== undefined) {
            data.key = portal.key;
        }

        if (portal.cRestClientId !== undefined) {
            data.C_REST_CLIENT_ID = portal.cRestClientId;
        }

        if (portal.cRestClientSecret !== undefined) {
            data.C_REST_CLIENT_SECRET = portal.cRestClientSecret;
        }

        if (portal.cRestWebHookUrl !== undefined) {
            data.C_REST_WEB_HOOK_URL = portal.cRestWebHookUrl;
        }

        // 🔥 ВОТ ГЛАВНОЕ убрать на продакшен client будет пущиться только в create
        if (portal.clientId) {
            data.clients = {
                connect: {
                    id: BigInt(portal.clientId!),
                },
            };
        }

        const result = await this.prisma.portal.update({
            where: { id: BigInt(portal.id!) },
            data,
        });

        return createPortalEntityFromPrisma(result);
    }
    async delete(id: number): Promise<void> {
        await this.prisma.portal.delete({
            where: { id: BigInt(id) },
        });
    }
    async deleteByClientId(clientId: number): Promise<void> {
        await this.prisma.portal.deleteMany({
            where: { client_id: BigInt(clientId) },
        });
    }
    async findById(id: number): Promise<PortalEntity | null> {
        const result = await this.prisma.portal.findUnique({
            where: { id: BigInt(id) },
            include: {
                agents: true,
                templates: true,
                clients: true,
            },
        });

        if (!result) return null;

        return createPortalEntityFromPrisma(result as PortalWithRelations);
    }
    async findByDomain(domain: string): Promise<PortalEntity | null> {
        const result = await this.prisma.portal.findFirst({
            where: { domain },
            include: {
                agents: true,
                templates: true,
                clients: true,
            },
        });
        if (!result) return null;
        return createPortalEntityFromPrisma(result as PortalWithRelations);
    }
    async findByClientId(clientId: number): Promise<PortalEntity[] | null> {
        const result = await this.prisma.portal.findMany({
            where: { client_id: BigInt(clientId) },
        });
        if (!result) return null;
        return result.map(portal => createPortalEntityFromPrisma(portal));
    }
    async findMany(): Promise<PortalEntity[] | null> {
        const result = await this.prisma.portal.findMany();
        if (!result) return null;

        return result.map(portal => createPortalEntityFromPrisma(portal));
    }

    async findManyWithRelations(): Promise<PortalEntity[] | null> {
        const result = await this.prisma.portal.findMany({
            include: {
                agents: true,
                templates: true,
                clients: true,
            },
        }) as PortalWithRelations[] | null;

        if (!result) return null;

        return result.map(portal => createPortalEntityFromPrisma(portal));
    }

    async updateWebhook(
        domain: string,
        webhook: string,
    ): Promise<PortalEntity | null> {
        const result = await this.prisma.portal.findFirst({
            where: { domain },
        });
        if (!result) return null;
        const updated = await this.prisma.portal.update({
            where: { id: result.id },
            data: {
                C_REST_WEB_HOOK_URL: webhook,
                C_REST_CLIENT_ID: webhook,
                C_REST_CLIENT_SECRET: webhook,
            },
        });
        return createPortalEntityFromPrisma(updated);
    }
}
