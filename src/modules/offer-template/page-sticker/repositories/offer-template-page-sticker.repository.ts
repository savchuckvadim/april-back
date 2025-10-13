import { OfferTemplatePageSticker } from '../entities/offer-template-page-sticker.entity';

export abstract class OfferTemplatePageStickerRepository {
    abstract findById(id: bigint): Promise<OfferTemplatePageSticker | null>;
    abstract findMany(filters?: {
        offer_template_page_id?: bigint;
    }): Promise<OfferTemplatePageSticker[]>;
    abstract findWithRelations(
        id: bigint,
    ): Promise<OfferTemplatePageSticker | null>;
    abstract create(
        data: Partial<OfferTemplatePageSticker>,
    ): Promise<OfferTemplatePageSticker>;
    abstract update(
        id: bigint,
        data: Partial<OfferTemplatePageSticker>,
    ): Promise<OfferTemplatePageSticker>;
    abstract delete(id: bigint): Promise<void>;
    abstract findByPage(page_id: bigint): Promise<OfferTemplatePageSticker[]>;
    abstract findByPageOrdered(
        page_id: bigint,
    ): Promise<OfferTemplatePageSticker[]>;
}
