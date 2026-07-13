import { OfferTemplateImage } from '../entities/offer-template-image.entity';

export abstract class OfferTemplateImageRepository {
    abstract findById(id: bigint): Promise<OfferTemplateImage | null>;
    abstract findMany(filters?: {
        portal_id?: bigint;
        storage_type?: 'app' | 'public' | 'private';
        parent?: 'template' | 'page' | 'block' | 'sticker' | 'other';
        is_public?: boolean;
    }): Promise<OfferTemplateImage[]>;
    abstract findWithRelations(id: bigint): Promise<OfferTemplateImage | null>;
    abstract create(
        data: Partial<OfferTemplateImage>,
    ): Promise<OfferTemplateImage>;
    abstract update(
        id: bigint,
        data: Partial<OfferTemplateImage>,
    ): Promise<OfferTemplateImage>;
    abstract delete(id: bigint): Promise<void>;
    abstract findByPortal(portal_id: bigint): Promise<OfferTemplateImage[]>;
    abstract findByParent(
        parent: 'template' | 'page' | 'block' | 'sticker' | 'other',
    ): Promise<OfferTemplateImage[]>;
}
