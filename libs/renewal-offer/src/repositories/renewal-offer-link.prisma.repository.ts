import { Injectable } from '@nestjs/common';
import type { Prisma, RenewalOfferLink } from 'generated/prisma';
import { PrismaService } from '@lib/core/prisma/prisma.service';

export type RenewalOfferLinkRecord = RenewalOfferLink;

/** Что пишем при создании ссылки: колонки цен + слепок предложения. */
export interface CreateRenewalOfferLinkData {
    id: string;
    token: string;
    clientName: string;
    title: string | null;
    salesIncluded: boolean;
    salesPrice: number;
    aiIncluded: boolean;
    aiEmployees: number;
    aiBasePrice: number;
    aiBaseEmployees: number;
    aiExtraPrice: number;
    aiFreeDelta: number;
    managerIncluded: boolean;
    managerPrice: number;
    devIncluded: boolean;
    devHours: number;
    devHourPrice: number;
    adjustment: number;
    adjustmentLabel: string;
    monthlyTotal: number;
    offerJson: Prisma.InputJsonValue;
    expiresAt: Date | null;
    createdBy: string | null;
    now: Date;
}

/** Таблица `renewal_offer_links` (Laravel-миграция 2026_11_02_120000). */
@Injectable()
export class RenewalOfferLinkPrismaRepository {
    constructor(private readonly prisma: PrismaService) {}

    create(data: CreateRenewalOfferLinkData): Promise<RenewalOfferLinkRecord> {
        const { now, ...values } = data;
        return this.prisma.renewalOfferLink.create({
            data: { ...values, createdAt: now, updatedAt: now },
        });
    }

    findAll(): Promise<RenewalOfferLinkRecord[]> {
        return this.prisma.renewalOfferLink.findMany({
            orderBy: { createdAt: 'desc' },
        });
    }

    findById(id: string): Promise<RenewalOfferLinkRecord | null> {
        return this.prisma.renewalOfferLink.findUnique({ where: { id } });
    }

    findByToken(token: string): Promise<RenewalOfferLinkRecord | null> {
        return this.prisma.renewalOfferLink.findUnique({ where: { token } });
    }

    revoke(id: string, now: Date): Promise<RenewalOfferLinkRecord> {
        return this.prisma.renewalOfferLink.update({
            where: { id },
            data: { revokedAt: now, updatedAt: now },
        });
    }

    async revokeAllNotRevoked(now: Date): Promise<number> {
        const { count } = await this.prisma.renewalOfferLink.updateMany({
            where: { revokedAt: null },
            data: { revokedAt: now, updatedAt: now },
        });
        return count;
    }

    async registerView(id: string, now: Date): Promise<void> {
        await this.prisma.renewalOfferLink.update({
            where: { id },
            data: { viewCount: { increment: 1 }, lastViewedAt: now },
        });
    }
}
