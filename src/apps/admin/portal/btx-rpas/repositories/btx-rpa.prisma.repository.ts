import { Injectable } from '@nestjs/common';
import { btx_rpas } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { BtxRpaRepository } from './btx-rpa.repository';

@Injectable()
export class BtxRpaPrismaRepository implements BtxRpaRepository {
    constructor(private readonly prisma: PrismaService) { }

    async create(rpa: Partial<btx_rpas>): Promise<btx_rpas | null> {
        const result = await this.prisma.btx_rpas.create({
            data: {
                name: rpa.name!,
                title: rpa.title!,
                code: rpa.code!,
                type: rpa.type!,
                typeId: rpa.typeId!,
                portal_id: BigInt(rpa.portal_id!),
                image: rpa.image,
                bitrixId: rpa.bitrixId ? BigInt(rpa.bitrixId) : null,
                description: rpa.description,
                entityTypeId: rpa.entityTypeId ? BigInt(rpa.entityTypeId) : null,
                forStageId: rpa.forStageId ? BigInt(rpa.forStageId) : null,
                forFilterId: rpa.forFilterId ? BigInt(rpa.forFilterId) : null,
                crmId: rpa.crmId ? BigInt(rpa.crmId) : null,
            },
        });
        return result;
    }

    async findById(id: number): Promise<btx_rpas | null> {
        const result = await this.prisma.btx_rpas.findUnique({
            where: { id: BigInt(id) },
            include: {
                portals: true,
            },
        });
        return result;
    }

    async findMany(): Promise<btx_rpas[] | null> {
        const result = await this.prisma.btx_rpas.findMany({
            include: {
                portals: true,
            },
        });
        return result;
    }

    async findByPortalId(portalId: number): Promise<btx_rpas[] | null> {
        const result = await this.prisma.btx_rpas.findMany({
            where: { portal_id: BigInt(portalId) },
            include: {
                portals: true,
            },
        });
        return result;
    }

    async update(id: number, rpa: Partial<btx_rpas>): Promise<btx_rpas | null> {
        const updateData: any = {};
        if (rpa.name !== undefined) updateData.name = rpa.name;
        if (rpa.title !== undefined) updateData.title = rpa.title;
        if (rpa.code !== undefined) updateData.code = rpa.code;
        if (rpa.type !== undefined) updateData.type = rpa.type;
        if (rpa.typeId !== undefined) updateData.typeId = rpa.typeId;
        if (rpa.portal_id !== undefined) updateData.portal_id = BigInt(rpa.portal_id);
        if (rpa.image !== undefined) updateData.image = rpa.image;
        if (rpa.bitrixId !== undefined) updateData.bitrixId = rpa.bitrixId ? BigInt(rpa.bitrixId) : null;
        if (rpa.description !== undefined) updateData.description = rpa.description;
        if (rpa.entityTypeId !== undefined) updateData.entityTypeId = rpa.entityTypeId ? BigInt(rpa.entityTypeId) : null;
        if (rpa.forStageId !== undefined) updateData.forStageId = rpa.forStageId ? BigInt(rpa.forStageId) : null;
        if (rpa.forFilterId !== undefined) updateData.forFilterId = rpa.forFilterId ? BigInt(rpa.forFilterId) : null;
        if (rpa.crmId !== undefined) updateData.crmId = rpa.crmId ? BigInt(rpa.crmId) : null;

        const result = await this.prisma.btx_rpas.update({
            where: { id: BigInt(id) },
            data: updateData,
        });
        return result;
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.prisma.btx_rpas.delete({
            where: { id: BigInt(id) },
        });
        return result ? true : false;
    }
}

