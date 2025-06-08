import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/core/prisma";
import { PortalRepository } from "./portal.repository";
import { PortalEntity } from "./portal.entity";
import { createPortalEntityFromPrisma } from "./lib/portal-entity.util";

@Injectable()
export class PortalPrismaRepository implements PortalRepository {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async findById(id: number): Promise<PortalEntity | null> {
        const result = await this.prisma.portals.findUnique({
            where: { id: BigInt(id) },
            include: {
                agents: true,
                templates: true
            }
        });

        if (!result) return null;

        return createPortalEntityFromPrisma(result);
    }
    async findByDomain(domain: string): Promise<PortalEntity | null> {
        const result = await this.prisma.portals.findFirst({
            where: { domain },
            include: {
                agents: true,
                templates: true
            }
        });
        if (!result) return null;
        return createPortalEntityFromPrisma(result);
    }
    async findMany(): Promise<PortalEntity[] | null> {
        const result = await this.prisma.portals.findMany();
        if (!result) return null;

        return result.map(portal => createPortalEntityFromPrisma(portal));
    }

    async findManyWithRelations(): Promise<PortalEntity[] | null> {
        const result = await this.prisma.portals.findMany({
            include: {
                agents: true,
                templates: true
            }
        });

        if (!result) return null;

        return result.map(portal => createPortalEntityFromPrisma(portal));
    }
} 