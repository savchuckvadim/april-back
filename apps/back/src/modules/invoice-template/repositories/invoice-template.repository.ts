import type { InvoiceTemplate, Prisma } from 'generated/prisma';
import type { InvoiceTemplateVisibilityValue } from '../dto/invoice-template.enums';

export type InvoiceTemplateFindManyFilters = {
    visibility?: InvoiceTemplateVisibilityValue;
    portal_id?: bigint;
    agent_id?: bigint;
    is_active?: boolean;
    is_archived?: boolean;
    search?: string;
};

export abstract class InvoiceTemplateRepository {
    abstract findById(id: string): Promise<InvoiceTemplate | null>;
    abstract findMany(
        filters: InvoiceTemplateFindManyFilters,
    ): Promise<InvoiceTemplate[]>;
    abstract create(
        data: Prisma.InvoiceTemplateCreateInput,
    ): Promise<InvoiceTemplate>;
    abstract update(
        id: string,
        data: Prisma.InvoiceTemplateUpdateInput,
    ): Promise<InvoiceTemplate>;
    abstract delete(id: string): Promise<void>;
    abstract updateMany(
        where: Prisma.InvoiceTemplateWhereInput,
        data: Prisma.InvoiceTemplateUpdateManyMutationInput,
    ): Promise<number>;
}
