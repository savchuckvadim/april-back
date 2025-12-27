import { Injectable } from '@nestjs/common';
import { btx_companies } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { BtxCompanyRepository } from './btx-company.repository';

@Injectable()
export class BtxCompanyPrismaRepository implements BtxCompanyRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(company: Partial<btx_companies>): Promise<btx_companies | null> {
        const result = await this.prisma.btx_companies.create({
            data: {
                name: company.name!,
                title: company.title!,
                code: company.code!,
                portal_id: BigInt(company.portal_id!),
            },
        });
        return result;
    }

    async findById(id: number): Promise<btx_companies | null> {
        const result = await this.prisma.btx_companies.findUnique({
            where: { id: BigInt(id) },
            include: {
                portals: true,
            },
        });
        return result;
    }

    async findMany(): Promise<btx_companies[] | null> {
        const result = await this.prisma.btx_companies.findMany({
            include: {
                portals: true,
            },
        });
        return result;
    }

    async findByPortalId(portalId: number): Promise<btx_companies[] | null> {
        const result = await this.prisma.btx_companies.findMany({
            where: { portal_id: BigInt(portalId) },
            include: {
                portals: true,
            },
        });
        return result;
    }

    async update(id: number, company: Partial<btx_companies>): Promise<btx_companies | null> {
        const updateData: any = {};
        if (company.name !== undefined) updateData.name = company.name;
        if (company.title !== undefined) updateData.title = company.title;
        if (company.code !== undefined) updateData.code = company.code;
        if (company.portal_id !== undefined) updateData.portal_id = BigInt(company.portal_id);

        const result = await this.prisma.btx_companies.update({
            where: { id: BigInt(id) },
            data: updateData,
        });
        return result;
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.prisma.btx_companies.delete({
            where: { id: BigInt(id) },
        });
        return result ? true : false;
    }
}

