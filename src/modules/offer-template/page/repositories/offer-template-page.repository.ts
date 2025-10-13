import { OfferTemplatePage } from '../entities/offer-template-page.entity';

export abstract class OfferTemplatePageRepository {
    abstract findById(id: bigint): Promise<OfferTemplatePage | null>;
    abstract findMany(filters?: {
        offer_template_id?: bigint;
        type?:
            | 'letter'
            | 'description'
            | 'infoblocks'
            | 'price'
            | 'lt'
            | 'other'
            | 'default';
        is_active?: boolean;
    }): Promise<OfferTemplatePage[]>;
    abstract findWithRelations(id: bigint): Promise<OfferTemplatePage | null>;
    abstract create(
        data: Partial<OfferTemplatePage>,
    ): Promise<OfferTemplatePage>;
    abstract update(
        id: bigint,
        data: Partial<OfferTemplatePage>,
    ): Promise<OfferTemplatePage>;
    abstract delete(id: bigint): Promise<void>;
    abstract findByTemplate(template_id: bigint): Promise<OfferTemplatePage[]>;
    abstract findByTemplateWithBlocks(
        template_id: bigint,
    ): Promise<OfferTemplatePage[]>;
}
