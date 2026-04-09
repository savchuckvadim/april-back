import { PrismaService } from '@/core';
import { BxDocumentDeal } from 'generated/prisma';
import { InnerDealRepository } from './inner-deal.repository';
import { Injectable } from '@nestjs/common';

@Injectable()
export class InnerDealPrismaRepository implements InnerDealRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findById(id: bigint): Promise<BxDocumentDeal | null> {
        return this.prisma.bxDocumentDeal.findUnique({
            where: { id },
        });
    }
    async findByDomainAndDealId(
        domain: string,
        dealId: number,
    ): Promise<BxDocumentDeal | null> {
        return this.prisma.bxDocumentDeal.findFirst({
            where: { domain, dealId },
        });
    }
    async findByDomain(domain: string): Promise<BxDocumentDeal[] | null> {
        return this.prisma.bxDocumentDeal.findMany({
            where: { domain },
        });
    }
    async setOfferTemplate(
        id: bigint,
        offerTemplateId: bigint,
    ): Promise<BxDocumentDeal> {
        return this.prisma.bxDocumentDeal.update({
            where: { id },
            data: { templateId: offerTemplateId },
        });
    }

    async findByServiceSmartId(
        serviceSmartId: number,
    ): Promise<BxDocumentDeal | null> {
        return this.prisma.bxDocumentDeal.findFirst({
            where: { serviceSmartId },
        });
    }
    async create(innerDeal: Partial<BxDocumentDeal>): Promise<BxDocumentDeal> {
        return this.prisma.bxDocumentDeal.create({
            data: innerDeal,
        });
    }
    async update(
        id: bigint,
        innerDeal: Partial<BxDocumentDeal>,
    ): Promise<BxDocumentDeal> {
        return this.prisma.bxDocumentDeal.update({
            where: { id },
            data: innerDeal,
        });
    }
    async delete(id: bigint): Promise<boolean> {
        const result = await this.prisma.bxDocumentDeal.delete({
            where: { id },
        });
        return result !== null;
    }
}
