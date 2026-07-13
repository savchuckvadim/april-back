import { BxDocumentDeal } from 'generated/prisma';
import { InnerDealRepository } from '../repositories/inner-deal.repository';
import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class InnerDealService {
    constructor(private readonly innerDealRepository: InnerDealRepository) {}

    async findById(id: bigint): Promise<BxDocumentDeal | null> {
        return await this.innerDealRepository.findById(BigInt(id));
    }
    async findByDomainAndDealId(
        domain: string,
        dealId: number,
    ): Promise<BxDocumentDeal | null> {
        return await this.innerDealRepository.findByDomainAndDealId(
            domain,
            dealId,
        );
    }
    async findByDomain(domain: string): Promise<BxDocumentDeal[] | null> {
        return await this.innerDealRepository.findByDomain(domain);
    }
    async findByServiceSmartId(
        serviceSmartId: number,
    ): Promise<BxDocumentDeal | null> {
        return await this.innerDealRepository.findByServiceSmartId(
            serviceSmartId,
        );
    }
    async setOfferTemplate(
        id: bigint,
        offerTemplateId: bigint,
    ): Promise<BxDocumentDeal> {
        return await this.innerDealRepository.setOfferTemplate(
            id,
            offerTemplateId,
        );
    }
    async setOfferTemplateByDomainAndDealId(
        domain: string,
        dealId: number,
        offerTemplateId: bigint,
    ): Promise<BxDocumentDeal> {
        const innerDeal = await this.innerDealRepository.findByDomainAndDealId(
            domain,
            dealId,
        );
        if (!innerDeal) {
            throw new NotFoundException(
                `Inner deal with domain ${domain} and dealId ${dealId} not found`,
            );
        }
        return await this.innerDealRepository.setOfferTemplate(
            innerDeal.id,
            offerTemplateId,
        );
    }
    async create(innerDeal: Partial<BxDocumentDeal>): Promise<BxDocumentDeal> {
        return await this.innerDealRepository.create(innerDeal);
    }
    async update(
        id: bigint,
        innerDeal: Partial<BxDocumentDeal>,
    ): Promise<BxDocumentDeal> {
        return await this.innerDealRepository.update(id, innerDeal);
    }
    async delete(id: bigint): Promise<boolean> {
        return await this.innerDealRepository.delete(id);
    }
}
