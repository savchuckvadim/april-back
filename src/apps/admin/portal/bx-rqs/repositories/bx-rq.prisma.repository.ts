import { Injectable } from '@nestjs/common';
import { bx_rqs } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { BxRqRepository } from './bx-rq.repository';

@Injectable()
export class BxRqPrismaRepository implements BxRqRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(rq: Partial<bx_rqs>): Promise<bx_rqs | null> {
        const result = await this.prisma.bx_rqs.create({
            data: {
                portal_id: rq.portal_id ? BigInt(rq.portal_id) : null,
                name: rq.name,
                code: rq.code,
                type: rq.type,
                bitrix_id: rq.bitrix_id,
                xml_id: rq.xml_id,
                entity_type_id: rq.entity_type_id,
                country_id: rq.country_id,
                is_active: rq.is_active ?? true,
                sort: rq.sort,
            },
        });
        return result;
    }

    async findById(id: number): Promise<bx_rqs | null> {
        const result = await this.prisma.bx_rqs.findUnique({
            where: { id: BigInt(id) },
        });
        return result;
    }

    async findMany(): Promise<bx_rqs[] | null> {
        const result = await this.prisma.bx_rqs.findMany();
        return result;
    }

    async findByPortalId(portalId: number): Promise<bx_rqs[] | null> {
        const result = await this.prisma.bx_rqs.findMany({
            where: { portal_id: BigInt(portalId) },
        });
        return result;
    }

    async update(id: number, rq: Partial<bx_rqs>): Promise<bx_rqs | null> {
        const updateData: any = {};
        if (rq.portal_id !== undefined) updateData.portal_id = rq.portal_id ? BigInt(rq.portal_id) : null;
        if (rq.name !== undefined) updateData.name = rq.name;
        if (rq.code !== undefined) updateData.code = rq.code;
        if (rq.type !== undefined) updateData.type = rq.type;
        if (rq.bitrix_id !== undefined) updateData.bitrix_id = rq.bitrix_id;
        if (rq.xml_id !== undefined) updateData.xml_id = rq.xml_id;
        if (rq.entity_type_id !== undefined) updateData.entity_type_id = rq.entity_type_id;
        if (rq.country_id !== undefined) updateData.country_id = rq.country_id;
        if (rq.is_active !== undefined) updateData.is_active = rq.is_active;
        if (rq.sort !== undefined) updateData.sort = rq.sort;

        const result = await this.prisma.bx_rqs.update({
            where: { id: BigInt(id) },
            data: updateData,
        });
        return result;
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.prisma.bx_rqs.delete({
            where: { id: BigInt(id) },
        });
        return result ? true : false;
    }
}

