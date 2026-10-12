import type { Prisma } from 'generated/prisma';
import {
    listMatches,
    parseClientTypes,
    parseSupplyTypes,
} from '@lib/portal-lib/konstructor/document-template';
import type { InvoiceTemplateFindManyFilters } from '../repositories/invoice-template.repository';
import type { InvoiceTemplateVisibilityValue } from '../dto/invoice-template.enums';

/** Часть фильтров, которую умеет выразить SQL. */
export function buildInvoiceTemplateFindManyWhereInput(
    filters: InvoiceTemplateFindManyFilters,
): Prisma.InvoiceTemplateWhereInput {
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

    return where;
}

/**
 * Остаток фильтров, который SQL выразить не может: `client_types` и
 * `supply_types` — JSON-массивы в LongText, у Prisma нет операций по
 * массивам в строковой колонке, а сырой SQL запрещён правилом проекта.
 *
 * `listMatches` трактует NULL как «годится любому», поэтому универсальные
 * шаблоны остаются в выборке при любом запрошенном значении.
 */
export function matchesInvoiceTemplateListFilters(
    row: { client_types: string | null; supply_types: string | null },
    filters: InvoiceTemplateFindManyFilters,
): boolean {
    if (
        filters.client_type !== undefined &&
        !listMatches(parseClientTypes(row.client_types), filters.client_type)
    ) {
        return false;
    }
    if (
        filters.supply_type !== undefined &&
        !listMatches(parseSupplyTypes(row.supply_types), filters.supply_type)
    ) {
        return false;
    }
    return true;
}

export function buildClearOtherDefaultsWhereInput(
    visibility: InvoiceTemplateVisibilityValue,
    portal_id: bigint | null,
    agent_id: bigint | null,
    exceptId: string,
): Prisma.InvoiceTemplateWhereInput {
    return {
        id: { not: exceptId },
        visibility,
        is_archived: false,
        portal_id: portal_id == null ? null : portal_id,
        agent_id: agent_id == null ? null : agent_id,
    };
}
