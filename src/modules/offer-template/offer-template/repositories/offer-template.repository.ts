import {
    OfferTemplate,
    OfferTemplateSummary,
} from '../entities/offer-template.entity';

export abstract class OfferTemplateRepository {
    abstract findById(id: bigint): Promise<OfferTemplate | null>;
    abstract findMany(filters?: {
        visibility?: 'public' | 'private' | 'user';
        portal_id?: bigint;
        is_active?: boolean;
        search?: string;
    }): Promise<OfferTemplateSummary[]>;
    abstract findWithRelations(id: bigint): Promise<OfferTemplate | null>;
    abstract create(data: Partial<OfferTemplate>): Promise<OfferTemplate>;
    abstract update(
        id: bigint,
        data: Partial<OfferTemplate>,
    ): Promise<OfferTemplate>;
    abstract delete(id: bigint): Promise<void>;
    abstract findByPortal(portal_id: bigint): Promise<OfferTemplateSummary[]>;
    abstract findPublic(): Promise<OfferTemplateSummary[]>;
    abstract findUserTemplates(
        user_id: bigint,
        portal_id: bigint,
    ): Promise<OfferTemplateSummary[]>;
}
