import { OfferTemplatePortal } from '../entities/offer-template-portal.entity';

export abstract class OfferTemplatePortalRepository {
    abstract findById(id: bigint): Promise<OfferTemplatePortal | null>;
    abstract findMany(filters?: {
        offer_template_id?: bigint;
        portal_id?: bigint;
        is_active?: boolean;
        is_default?: boolean;
    }): Promise<OfferTemplatePortal[]>;
    abstract findWithRelations(id: bigint): Promise<OfferTemplatePortal | null>;
    abstract create(
        data: Partial<OfferTemplatePortal>,
    ): Promise<OfferTemplatePortal>;
    abstract update(
        id: bigint,
        data: Partial<OfferTemplatePortal>,
    ): Promise<OfferTemplatePortal>;
    abstract delete(id: bigint): Promise<void>;
    abstract findByPortal(portal_id: bigint): Promise<OfferTemplatePortal[]>;
    abstract findByTemplate(
        template_id: bigint,
    ): Promise<OfferTemplatePortal[]>;
    abstract findActiveByPortal(
        portal_id: bigint,
    ): Promise<OfferTemplatePortal[]>;
}
