import { OfferTemplate } from '../../offer-template';

export class OfferTemplatePortal {
    id: bigint;
    offer_template_id: bigint;
    portal_id: bigint;
    is_default: boolean;
    is_active: boolean;
    created_at?: Date;
    updated_at?: Date;

    // Relations
    offer_templates?: OfferTemplate;

    constructor(partial: Partial<OfferTemplatePortal>) {
        Object.assign(this, {
            ...partial,
            created_at: partial.created_at || undefined,
            updated_at: partial.updated_at || undefined,
            offer_templates: partial.offer_templates || undefined,
        });
    }
}
