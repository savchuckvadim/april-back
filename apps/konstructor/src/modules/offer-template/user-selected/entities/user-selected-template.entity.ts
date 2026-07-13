import { OfferTemplate } from '../../offer-template';

export class UserSelectedTemplate {
    id: string;
    bitrix_user_id: bigint;
    portal_id: bigint;
    offer_template_id: bigint;
    is_current: boolean;
    is_favorite: boolean;
    is_active: boolean;
    price_settings?: string;
    infoblock_settings?: string;
    letter_text?: string;
    sale_text_1?: string;
    sale_text_2?: string;
    sale_text_3?: string;
    sale_text_4?: string;
    sale_text_5?: string;
    created_at?: Date;
    updated_at?: Date;

    // Relations
    offerTemplate?: OfferTemplate;

    constructor(partial: Partial<UserSelectedTemplate>) {
        Object.assign(this, {
            ...partial,
            created_at: partial.created_at || undefined,
            updated_at: partial.updated_at || undefined,
            price_settings: partial.price_settings ?? undefined,
            infoblock_settings: partial.infoblock_settings ?? undefined,
            letter_text: partial.letter_text ?? undefined,
            sale_text_1: partial.sale_text_1 ?? undefined,
            sale_text_2: partial.sale_text_2 ?? undefined,
            sale_text_3: partial.sale_text_3 ?? undefined,
            sale_text_4: partial.sale_text_4 ?? undefined,
            sale_text_5: partial.sale_text_5 ?? undefined,
            offerTemplate: partial.offerTemplate || undefined,
        });
    }
}
