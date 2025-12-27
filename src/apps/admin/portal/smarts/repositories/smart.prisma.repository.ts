import { Injectable } from '@nestjs/common';
import { smarts } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { SmartRepository } from './smart.repository';

@Injectable()
export class SmartPrismaRepository implements SmartRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(smart: Partial<smarts>): Promise<smarts | null> {
        const result = await this.prisma.smarts.create({
            data: {
                type: smart.type!,
                group: smart.group!,
                name: smart.name!,
                title: smart.title!,
                entityTypeId: BigInt(smart.entityTypeId!),
                portal_id: BigInt(smart.portal_id!),
                bitrixId: smart.bitrixId ? BigInt(smart.bitrixId) : null,
                forStageId: smart.forStageId ? BigInt(smart.forStageId) : null,
                forFilterId: smart.forFilterId ? BigInt(smart.forFilterId) : null,
                crmId: smart.crmId ? BigInt(smart.crmId) : null,
                forStage: smart.forStage,
                forFilter: smart.forFilter,
                crm: smart.crm,
            },
        });
        return result;
    }

    async findById(id: number): Promise<smarts | null> {
        const result = await this.prisma.smarts.findUnique({
            where: { id: BigInt(id) },
            include: {
                portals: true,
            },
        });
        return result;
    }

    async findMany(): Promise<smarts[] | null> {
        const result = await this.prisma.smarts.findMany({
            include: {
                portals: true,
            },
        });
        return result;
    }

    async findByPortalId(portalId: number): Promise<smarts[] | null> {
        const result = await this.prisma.smarts.findMany({
            where: { portal_id: BigInt(portalId) },
            include: {
                portals: true,
            },
        });
        return result;
    }

    async update(id: number, smart: Partial<smarts>): Promise<smarts | null> {
        const updateData: any = {};
        if (smart.type !== undefined) updateData.type = smart.type;
        if (smart.group !== undefined) updateData.group = smart.group;
        if (smart.name !== undefined) updateData.name = smart.name;
        if (smart.title !== undefined) updateData.title = smart.title;
        if (smart.entityTypeId !== undefined) updateData.entityTypeId = BigInt(smart.entityTypeId);
        if (smart.portal_id !== undefined) updateData.portal_id = BigInt(smart.portal_id);
        if (smart.bitrixId !== undefined) updateData.bitrixId = smart.bitrixId ? BigInt(smart.bitrixId) : null;
        if (smart.forStageId !== undefined) updateData.forStageId = smart.forStageId ? BigInt(smart.forStageId) : null;
        if (smart.forFilterId !== undefined) updateData.forFilterId = smart.forFilterId ? BigInt(smart.forFilterId) : null;
        if (smart.crmId !== undefined) updateData.crmId = smart.crmId ? BigInt(smart.crmId) : null;
        if (smart.forStage !== undefined) updateData.forStage = smart.forStage;
        if (smart.forFilter !== undefined) updateData.forFilter = smart.forFilter;
        if (smart.crm !== undefined) updateData.crm = smart.crm;

        const result = await this.prisma.smarts.update({
            where: { id: BigInt(id) },
            data: updateData,
        });
        return result;
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.prisma.smarts.delete({
            where: { id: BigInt(id) },
        });
        return result ? true : false;
    }
}

