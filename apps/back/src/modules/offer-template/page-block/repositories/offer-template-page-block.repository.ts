import { OfferTemplatePageBlock } from '../entities/offer-template-page-block.entity';
import { CreateOfferTemplatePageBlockDto } from '../dtos/create-offer-template-page-block.dto';

export abstract class OfferTemplatePageBlockRepository {
    abstract findById(id: bigint): Promise<OfferTemplatePageBlock | null>;
    abstract findMany(filters?: {
        offer_template_page_id?: bigint;
        type?:
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
    }): Promise<OfferTemplatePageBlock[]>;
    abstract findWithRelations(
        id: bigint,
    ): Promise<OfferTemplatePageBlock | null>;
    abstract create(
        data: Partial<OfferTemplatePageBlock>,
    ): Promise<OfferTemplatePageBlock>;
    abstract createMany(
        data: Partial<CreateOfferTemplatePageBlockDto>[],
    ): Promise<OfferTemplatePageBlock[]>;
    abstract update(
        id: bigint,
        data: Partial<OfferTemplatePageBlock>,
    ): Promise<OfferTemplatePageBlock>;
    abstract delete(id: bigint): Promise<void>;
    abstract findByPage(page_id: bigint): Promise<OfferTemplatePageBlock[]>;
    abstract findByPageOrdered(
        page_id: bigint,
    ): Promise<OfferTemplatePageBlock[]>;
}
