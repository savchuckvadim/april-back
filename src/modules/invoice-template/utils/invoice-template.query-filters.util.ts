import type { InvoiceTemplateQueryDto } from '../dto/invoice-template-query.dto';
import type { InvoiceTemplateFindManyFilters } from '../repositories/invoice-template.repository';

export function invoiceTemplateQueryToFindManyFilters(
    query?: InvoiceTemplateQueryDto,
): InvoiceTemplateFindManyFilters {
    const filters: InvoiceTemplateFindManyFilters = {};
    if (!query) {
        return filters;
    }
    if (query.visibility !== undefined) {
        filters.visibility = query.visibility;
    }
    if (query.portal_id !== undefined) {
        filters.portal_id = BigInt(query.portal_id);
    }
    if (query.agent_id !== undefined) {
        filters.agent_id = BigInt(query.agent_id);
    }
    if (query.is_active !== undefined) {
        filters.is_active = query.is_active;
    }
    if (query.is_archived !== undefined) {
        filters.is_archived = query.is_archived;
    }
    if (query.search) {
        filters.search = query.search;
    }
    return filters;
}
