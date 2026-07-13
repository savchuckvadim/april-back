import { OfferTemplateFont } from '../entities/offer-template-font.entity';

export abstract class OfferTemplateFontRepository {
    abstract findById(id: bigint): Promise<OfferTemplateFont | null>;
    abstract findMany(filters?: {
        offer_template_id?: bigint;
    }): Promise<OfferTemplateFont[]>;
    abstract findWithRelations(id: bigint): Promise<OfferTemplateFont | null>;
    abstract create(
        data: Partial<OfferTemplateFont>,
    ): Promise<OfferTemplateFont>;
    abstract update(
        id: bigint,
        data: Partial<OfferTemplateFont>,
    ): Promise<OfferTemplateFont>;
    abstract delete(id: bigint): Promise<void>;
    abstract findByTemplate(template_id: bigint): Promise<OfferTemplateFont[]>;
}
