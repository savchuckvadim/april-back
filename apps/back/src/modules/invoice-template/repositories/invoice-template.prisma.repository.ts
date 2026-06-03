import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/prisma/prisma.service';
import type { InvoiceTemplate, Prisma } from 'generated/prisma';
import {
    InvoiceTemplateFindManyFilters,
    InvoiceTemplateRepository,
} from './invoice-template.repository';

@Injectable()
export class InvoiceTemplatePrismaRepository extends InvoiceTemplateRepository {
    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async findById(id: string): Promise<InvoiceTemplate | null> {
        return this.prisma.invoiceTemplate.findUnique({
            where: { id },
            include: { portal: true, agent: true },
        });
    }

    async findMany(
        filters: InvoiceTemplateFindManyFilters,
    ): Promise<InvoiceTemplate[]> {
        const where: Prisma.InvoiceTemplateWhereInput = {};

        if (filters.visibility !== undefined) {
            where.visibility = filters.visibility;
        }
        if (filters.portal_id !== undefined) {
            where.portal_id = filters.portal_id;
        }
        if (filters.agent_id !== undefined) {
            where.agent_id = filters.agent_id;
        }
        if (filters.is_active !== undefined) {
            where.is_active = filters.is_active;
        }
        if (filters.is_archived !== undefined) {
            where.is_archived = filters.is_archived;
        }
        if (filters.search?.trim()) {
            const q = filters.search.trim();
            where.OR = [
                { name: { contains: q } },
                { code: { contains: q } },
                { description: { contains: q } },
            ];
        }

        return this.prisma.invoiceTemplate.findMany({
            where,
            orderBy: { created_at: 'desc' },
            include: { portal: true, agent: true },
        });
    }

    async create(
        data: Prisma.InvoiceTemplateCreateInput,
    ): Promise<InvoiceTemplate> {
        return this.prisma.invoiceTemplate.create({
            data,
            include: { portal: true, agent: true },
        });
    }

    async update(
        id: string,
        data: Prisma.InvoiceTemplateUpdateInput,
    ): Promise<InvoiceTemplate> {
        return this.prisma.invoiceTemplate.update({
            where: { id },
            data,
            include: { portal: true, agent: true },
        });
    }

    async delete(id: string): Promise<void> {
        await this.prisma.invoiceTemplate.delete({ where: { id } });
    }

    async updateMany(
        where: Prisma.InvoiceTemplateWhereInput,
        data: Prisma.InvoiceTemplateUpdateManyMutationInput,
    ): Promise<number> {
        const res = await this.prisma.invoiceTemplate.updateMany({
            where,
            data,
        });
        return res.count;
    }
}
