import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lib/core/prisma/prisma.service';
import type { InvoiceTemplate, Prisma } from 'generated/prisma';
import {
    buildInvoiceTemplateFindManyWhereInput,
    matchesInvoiceTemplateListFilters,
} from '../utils/invoice-template.prisma-where.util';
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
        const rows = await this.prisma.invoiceTemplate.findMany({
            where: buildInvoiceTemplateFindManyWhereInput(filters),
            orderBy: { created_at: 'desc' },
            include: { portal: true, agent: true },
        });

        // Признаки client_types/supply_types отбираются уже в памяти —
        // почему именно так, см. докблок matchesInvoiceTemplateListFilters.
        return rows.filter(row =>
            matchesInvoiceTemplateListFilters(row, filters),
        );
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
