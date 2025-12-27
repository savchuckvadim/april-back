import { Injectable } from '@nestjs/common';
import { btx_leads } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { BtxLeadRepository } from './btx-lead.repository';

@Injectable()
export class BtxLeadPrismaRepository implements BtxLeadRepository {
    constructor(private readonly prisma: PrismaService) { }

    async create(lead: Partial<btx_leads>): Promise<btx_leads | null> {
        const result = await this.prisma.btx_leads.create({
            data: {
                name: lead.name!,
                title: lead.title!,
                code: lead.code!,
                portal_id: BigInt(lead.portal_id!),
            },
        });
        return result;
    }

    async findById(id: number): Promise<btx_leads | null> {
        const result = await this.prisma.btx_leads.findUnique({
            where: { id: BigInt(id) },
            include: {
                portals: true,
            },
        });
        return result;
    }

    async findMany(): Promise<btx_leads[] | null> {
        const result = await this.prisma.btx_leads.findMany({
            include: {
                portals: true,
            },
        });
        return result;
    }

    async findByPortalId(portalId: number): Promise<btx_leads[] | null> {
        const result = await this.prisma.btx_leads.findMany({
            where: { portal_id: BigInt(portalId) },
            include: {
                portals: true,
            },
        });
        return result;
    }

    async update(id: number, lead: Partial<btx_leads>): Promise<btx_leads | null> {
        const updateData: any = {};
        if (lead.name !== undefined) updateData.name = lead.name;
        if (lead.title !== undefined) updateData.title = lead.title;
        if (lead.code !== undefined) updateData.code = lead.code;
        if (lead.portal_id !== undefined) updateData.portal_id = BigInt(lead.portal_id);

        const result = await this.prisma.btx_leads.update({
            where: { id: BigInt(id) },
            data: updateData,
        });
        return result;
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.prisma.btx_leads.delete({
            where: { id: BigInt(id) },
        });
        return result ? true : false;
    }
}

