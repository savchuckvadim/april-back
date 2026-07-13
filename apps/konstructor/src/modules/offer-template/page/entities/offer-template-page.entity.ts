import { OfferTemplate } from '../../offer-template';
import { OfferTemplatePageBlock } from '../../page-block';
import { OfferTemplatePageSticker } from '../../page-sticker';

export class OfferTemplatePage {
    id: bigint | string;
    created_at?: Date;
    updated_at?: Date;
    offer_template_id: bigint;
    order: number;
    name: string;
    code?: string;
    type:
        | 'letter'
        | 'description'
        | 'infoblocks'
        | 'price'
        | 'lt'
        | 'other'
        | 'default';
    is_active: boolean;
    settings?: string;
    stickers?: string;
    background?: string;
    colors?: string;
    fonts?: string;

    // Relations
    offerTemplate?: OfferTemplate;
    offerTemplatePageBlocks?: OfferTemplatePageBlock[];
    offerTemplatePageStickers?: OfferTemplatePageSticker[];

    constructor(partial: Partial<OfferTemplatePage>) {
        Object.assign(this, {
            ...partial,
            created_at: partial.created_at || undefined,
            updated_at: partial.updated_at || undefined,
            offerTemplate: partial.offerTemplate || undefined,
            offerTemplatePageBlocks:
                partial.offerTemplatePageBlocks || undefined,
            offerTemplatePageStickers:
                partial.offerTemplatePageStickers || undefined,
        });
    }
}
