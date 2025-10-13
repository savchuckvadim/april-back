import { OfferTemplate } from '../../offer-template/';

export class OfferTemplateFont {
    id: bigint;
    created_at?: Date;
    updated_at?: Date;
    offer_template_id: bigint;
    name: string;
    code: string;
    data?: string;
    items?: string;
    current?: string;
    settings?: string;

    // Relations
    offerTemplate?: OfferTemplate;

    constructor(partial: Partial<OfferTemplateFont>) {
        Object.assign(this, {
            ...partial,
            created_at: partial.created_at || undefined,
            updated_at: partial.updated_at || undefined,
            offerTemplate: partial.offerTemplate || undefined,
        });
    }
}
