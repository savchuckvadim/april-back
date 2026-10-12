import type { InvoiceTemplate, Prisma } from 'generated/prisma';
import type { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import type { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';
import type { InvoiceTemplateVisibilityValue } from '../dto/invoice-template.enums';

export type InvoiceTemplateFindManyFilters = {
    visibility?: InvoiceTemplateVisibilityValue;
    portal_id?: bigint;
    agent_id?: bigint;
    is_active?: boolean;
    is_archived?: boolean;
    search?: string;
    /**
     * Признаки шаблона. В отличие от остальных фильтров отбор по ним идёт
     * НЕ в SQL: списки лежат JSON-ом в LongText, операций по массивам в
     * строковой колонке у Prisma нет, а сырой SQL в проекте запрещён.
     * Поэтому репозиторий фильтрует их в TypeScript после выборки —
     * через `listMatches`, который трактует NULL как «годится любому».
     */
    client_type?: ClientTypeEnum;
    supply_type?: SupplyTypeEnum;
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
