import { OfferTemplateImage } from '../../image/';
import { OfferTemplatePage } from '../../page/';

export class OfferTemplatePageSticker {
    id: bigint;
    created_at?: Date;
    updated_at?: Date;
    offer_template_page_id: bigint;
    order: number;
    name: string;
    code?: string;
    size: string;
    height: string;
    width: string;
    position?: string;
    style?: string;
    settings?: string;
    background?: string;
    colors?: string;
    image_id?: bigint;

    // Relations
    offerTemplateImage?: OfferTemplateImage;
    offerTemplatePage?: OfferTemplatePage;

    constructor(partial: Partial<OfferTemplatePageSticker>) {
        Object.assign(this, {
            ...partial,
            created_at: partial.created_at ?? undefined,
            updated_at: partial.updated_at ?? undefined,
            offerTemplateImage: partial.offerTemplateImage ?? undefined,
            offerTemplatePage: partial.offerTemplatePage ?? undefined,
        });
    }
}
