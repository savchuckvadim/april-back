import { OfferTemplateImage } from '../../image/';
import { OfferTemplatePage } from '../../page/';

export class OfferTemplatePageBlock {
    id: bigint;
    created_at?: Date;
    updated_at?: Date;
    offer_template_page_id: bigint;
    order: number;
    name: string;
    code?: string;
    type:
        | 'background'
        | 'about'
        | 'hero'
        | 'letter'
        | 'documentNumber'
        | 'manager'
        | 'logo'
        | 'stamp'
        | 'header'
        | 'footer'
        | 'infoblocks'
        | 'price'
        | 'slogan'
        | 'infoblocksDescription'
        | 'lt'
        | 'otherComplects'
        | 'comparison'
        | 'comparisonComplects'
        | 'comparisonIblocks'
        | 'user'
        | 'default';
    content?: string;
    settings?: string;
    stickers?: string;
    background?: string;
    colors?: string;
    image_id?: bigint;

    // Relations
    offerTemplateImage?: OfferTemplateImage;
    offerTemplatePage?: OfferTemplatePage;

    constructor(partial: Partial<OfferTemplatePageBlock>) {
        Object.assign(this, {
            ...partial,
            created_at: partial.created_at || undefined,
            updated_at: partial.updated_at || undefined,
            offerTemplateImage: partial.offerTemplateImage || undefined,
            offerTemplatePage: partial.offerTemplatePage || undefined,
        });
    }
}
