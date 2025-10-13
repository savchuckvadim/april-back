import { OfferTemplatePageBlock } from '../../page-block/';
import { OfferTemplatePageSticker } from '../../page-sticker/';

export class OfferTemplateImage {
    id: bigint;
    created_at?: Date;
    updated_at?: Date;
    path: string;
    storage_type: 'app' | 'public' | 'private';
    original_name?: string;
    mime?: string;
    size: string;
    height: string;
    width: string;
    position?: string;
    style?: string;
    settings?: string;
    is_public: boolean;
    parent: 'template' | 'page' | 'block' | 'sticker' | 'other';
    bitrix_user_id?: string;
    domain?: string;
    portal_id?: bigint;

    // Relations
    offerTemplatePageBlocks?: OfferTemplatePageBlock[];
    offerTemplatePageStickers?: OfferTemplatePageSticker[];

    constructor(partial: Partial<OfferTemplateImage>) {
        Object.assign(this, {
            ...partial,
            created_at: partial.created_at || undefined,
            updated_at: partial.updated_at || undefined,
            offerTemplatePageBlocks:
                partial.offerTemplatePageBlocks || undefined,
            offerTemplatePageStickers:
                partial.offerTemplatePageStickers || undefined,
        });
    }
}
