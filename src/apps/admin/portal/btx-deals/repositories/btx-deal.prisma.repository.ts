import { Injectable } from '@nestjs/common';
import { btx_deals } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { BtxDealRepository } from './btx-deal.repository';

@Injectable()
export class BtxDealPrismaRepository implements BtxDealRepository {
    constructor(private readonly prisma: PrismaService) { }

    async create(deal: Partial<btx_deals>): Promise<btx_deals | null> {
        const result = await this.prisma.btx_deals.create({
            data: {
                name: deal.name!,
                title: deal.title!,
                code: deal.code!,
                portal_id: BigInt(deal.portal_id!),
            },
        });
        return result;
    }

    async findById(id: number): Promise<btx_deals | null> {
        const result = await this.prisma.btx_deals.findUnique({
            where: { id: BigInt(id) },
            include: {
                portals: true,
            },
        });
        return result;
    }

    async findMany(): Promise<btx_deals[] | null> {
        const result = await this.prisma.btx_deals.findMany({
            include: {
                portals: true,
            },
        });
        return result;
    }

    async findByPortalId(portalId: number): Promise<btx_deals[] | null> {
        const result = await this.prisma.btx_deals.findMany({
            where: { portal_id: BigInt(portalId) },
            include: {
                portals: true,
            },
        });
        return result;
    }

    async update(id: number, deal: Partial<btx_deals>): Promise<btx_deals | null> {
        const updateData: any = {};
        if (deal.name !== undefined) updateData.name = deal.name;
        if (deal.title !== undefined) updateData.title = deal.title;
        if (deal.code !== undefined) updateData.code = deal.code;
        if (deal.portal_id !== undefined) updateData.portal_id = BigInt(deal.portal_id);

        const result = await this.prisma.btx_deals.update({
            where: { id: BigInt(id) },
            data: updateData,
        });
        return result;
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.prisma.btx_deals.delete({
            where: { id: BigInt(id) },
        });
        return result ? true : false;
    }
}

