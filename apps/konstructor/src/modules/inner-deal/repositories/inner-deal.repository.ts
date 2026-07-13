import { BxDocumentDeal } from 'generated/prisma';

export abstract class InnerDealRepository {
    abstract findById(id: bigint): Promise<BxDocumentDeal | null>;
    abstract findByDomainAndDealId(
        domain: string,
        dealId: number,
    ): Promise<BxDocumentDeal | null>;
    abstract findByDomain(domain: string): Promise<BxDocumentDeal[] | null>;

    abstract findByServiceSmartId(
        serviceSmartId: number,
    ): Promise<BxDocumentDeal | null>;
    abstract setOfferTemplate(
        id: bigint,
        offerTemplateId: bigint,
    ): Promise<BxDocumentDeal>;
    abstract create(
        innerDeal: Partial<BxDocumentDeal>,
    ): Promise<BxDocumentDeal>;
    abstract update(
        id: bigint,
        innerDeal: Partial<BxDocumentDeal>,
    ): Promise<BxDocumentDeal>;
    abstract delete(id: bigint): Promise<boolean>;
}
