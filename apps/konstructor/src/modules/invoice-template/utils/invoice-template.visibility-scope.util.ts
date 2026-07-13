import { BadRequestException } from '@nestjs/common';
import {
    InvoiceTemplateVisibility,
    type InvoiceTemplateVisibilityValue,
} from '../dto/invoice-template.enums';

export type InvoiceTemplateScope = {
    portal_id: bigint | null;
    agent_id: bigint | null;
};

export function parseInvoiceTemplateVisibilityScope(
    visibility: InvoiceTemplateVisibilityValue,
    portal_id?: bigint | null,
    agent_id?: bigint | null,
): InvoiceTemplateScope {
    if (visibility === InvoiceTemplateVisibility.PUBLIC) {
        return { portal_id: null, agent_id: null };
    }
    if (visibility === InvoiceTemplateVisibility.PORTAL) {
        if (portal_id == null) {
            throw new BadRequestException(
                'Для visibility=portal нужен portal_id',
            );
        }
        return { portal_id, agent_id: null };
    }
    if (visibility === InvoiceTemplateVisibility.PROVIDER) {
        if (portal_id == null || agent_id == null) {
            throw new BadRequestException(
                'Для visibility=provider нужны portal_id и agent_id',
            );
        }
        return { portal_id, agent_id };
    }
    return { portal_id: portal_id ?? null, agent_id: agent_id ?? null };
}
