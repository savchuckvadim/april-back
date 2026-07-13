import type { offer_templates_visibility } from 'generated/prisma';

export type OfferTemplateFilters = {
    visibility?: offer_templates_visibility;
    portal_id?: bigint;
    is_active?: boolean;
    search?: string;
};
