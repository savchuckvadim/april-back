import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { PortalRepository } from './portal.repository';
import { PortalEntity } from './portal.entity';
import { createPortalEntityFromPrisma } from './lib/portal-entity.util';

@Injectable()
export class PortalPrismaRepository implements PortalRepository {
    constructor(private readonly prisma: PrismaService) { }

    async create(portal: Partial<PortalEntity>): Promise<PortalEntity | null> {
        const result = await this.prisma.portal.create({
            data: {

                created_at: new Date(),
                updated_at: new Date(),
                number: portal.number!,
                C_REST_CLIENT_ID: portal.cRestClientId!,
                C_REST_CLIENT_SECRET: portal.cRestClientSecret!,
                C_REST_WEB_HOOK_URL: portal.cRestWebHookUrl!,
                domain: portal.domain!,
                key: portal.key!,


            },
        });
        return createPortalEntityFromPrisma(result);
    }
    async update(portal: Partial<PortalEntity>): Promise<PortalEntity | null> {
        const data = {
            updated_at: new Date(),
        }
        for (const key in portal) {
            if (portal[key] && key !== 'id') {
                data[key] = portal[key];
            }
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
    async findById(id: number): Promise<PortalEntity | null> {
        const result = await this.prisma.portal.findUnique({
            where: { id: BigInt(id) },
            include: {
                agents: true,
                templates: true,
            },
        });

        if (!result) return null;

        return createPortalEntityFromPrisma(result);
    }
    async findByDomain(domain: string): Promise<PortalEntity | null> {
        const result = await this.prisma.portal.findFirst({
            where: { domain },
            include: {
                agents: true,
                templates: true,
            },
        });
        if (!result) return null;
        return createPortalEntityFromPrisma(result);
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
            },
        });

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
