import { PrismaService } from '@lib/core';
import { BxDocumentDeal } from 'generated/prisma';
import {
    InnerDealRepository,
    InnerDealSnapshotOrder,
} from './inner-deal.repository';
import { Injectable } from '@nestjs/common';

const orderById = (order: InnerDealSnapshotOrder): { id: 'asc' | 'desc' } => ({
    id: order === 'newest' ? 'desc' : 'asc',
});

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
        // fallback Laravel getDeal — любая запись сделки, но не вариант КП
        return this.prisma.bxDocumentDeal.findFirst({
            where: { domain, dealId, smartId: null },
        });
    }
    async findSnapshot(
        domain: string,
        dealId: number,
        serviceSmartId: number | null,
        order: InnerDealSnapshotOrder = 'oldest',
    ): Promise<BxDocumentDeal | null> {
        // serviceSmartId: null матчит SQL NULL — обычные (не смарт) записи.
        // smartId: null обязателен: у сделки, где есть только варианты КП
        // (строки с smartId), обычный upsert/settings иначе перезаписал бы
        // строку варианта (баг §2.3 плана переезда).
        return this.prisma.bxDocumentDeal.findFirst({
            where: { domain, dealId, serviceSmartId, smartId: null },
            orderBy: orderById(order),
        });
    }
    async listByDealId(
        domain: string,
        dealId: number,
    ): Promise<BxDocumentDeal[]> {
        return this.prisma.bxDocumentDeal.findMany({
            where: { domain, dealId },
            orderBy: { id: 'asc' },
        });
    }
    async findVariantSnapshot(
        domain: string,
        dealId: number,
        variantSmartId: number,
        order: InnerDealSnapshotOrder = 'newest',
    ): Promise<BxDocumentDeal | null> {
        return this.prisma.bxDocumentDeal.findFirst({
            where: { domain, dealId, smartId: variantSmartId },
            orderBy: orderById(order),
        });
    }
    async listVariantsByDealId(
        domain: string,
        dealId: number,
    ): Promise<BxDocumentDeal[]> {
        // варианты — строки с непустым smartId; обычный слепок сделки и слепок
        // «предложения на будущий период» сюда не попадают
        return this.prisma.bxDocumentDeal.findMany({
            where: { domain, dealId, smartId: { not: null } },
            orderBy: { id: 'asc' },
        });
    }
    async listLibrary(portalId: bigint | null): Promise<BxDocumentDeal[]> {
        const portalRows = portalId
            ? [
                  { portalId, kind: { in: ['favorite', 'promotion'] } },
                  // легаси-избранное Laravel: kind ещё не проставлен
                  { portalId, kind: null, isFavorite: true },
              ]
            : [];
        return this.prisma.bxDocumentDeal.findMany({
            where: {
                isArchived: false,
                OR: [
                    ...portalRows,
                    // акции вендора на все порталы
                    {
                        portalId: null,
                        kind: 'promotion',
                        visibility: { in: ['global', 'all'] },
                    },
                ],
            },
            orderBy: { id: 'desc' },
        });
    }
    async findPortalIdByDomain(domain: string): Promise<bigint | null> {
        const portal = await this.prisma.portal.findFirst({
            where: { domain },
            select: { id: true },
        });
        return portal?.id ?? null;
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
        domain: string,
        serviceSmartId: number,
        order: InnerDealSnapshotOrder = 'oldest',
    ): Promise<BxDocumentDeal | null> {
        // domain обязателен: id элемента смарта уникален только внутри портала
        return this.prisma.bxDocumentDeal.findFirst({
            where: { domain, serviceSmartId },
            orderBy: orderById(order),
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
