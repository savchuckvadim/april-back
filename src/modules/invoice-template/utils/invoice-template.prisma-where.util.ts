import type { Prisma } from 'generated/prisma';
import type { InvoiceTemplateVisibilityValue } from '../dto/invoice-template.enums';

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
