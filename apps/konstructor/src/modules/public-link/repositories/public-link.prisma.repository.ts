import { Injectable } from '@nestjs/common';
import type { KonstructorPublicLink } from 'generated/prisma';
import { PrismaService } from 'src/core/prisma';

export type PublicLinkRecord = KonstructorPublicLink;
export type PublicLinkWithDomain = PublicLinkRecord & {
    portal: { domain: string | null };
};

export interface CreatePublicLinkData {
    id: string;
    token: string;
    portalId: bigint;
    title: string;
    expiresAt: Date | null;
    now: Date;
}

const WITH_DOMAIN = { portal: { select: { domain: true } } } as const;

/** Таблица `konstructor_public_link` (Laravel-миграция 2026_10_31_110000). */
@Injectable()
export class PublicLinkPrismaRepository {
    constructor(private readonly prisma: PrismaService) {}

    create(data: CreatePublicLinkData): Promise<PublicLinkWithDomain> {
        const { now, ...values } = data;
        return this.prisma.konstructorPublicLink.create({
            data: { ...values, createdAt: now, updatedAt: now },
            include: WITH_DOMAIN,
        });
    }

    async portalExists(portalId: bigint): Promise<boolean> {
        const portal = await this.prisma.portal.findUnique({
            where: { id: portalId },
            select: { id: true },
        });
        return Boolean(portal);
    }

    findAll(): Promise<PublicLinkWithDomain[]> {
        return this.prisma.konstructorPublicLink.findMany({
            include: WITH_DOMAIN,
            orderBy: { createdAt: 'desc' },
        });
    }

    findById(id: string): Promise<PublicLinkWithDomain | null> {
        return this.prisma.konstructorPublicLink.findUnique({
            where: { id },
            include: WITH_DOMAIN,
        });
    }

    findByToken(token: string): Promise<PublicLinkWithDomain | null> {
        return this.prisma.konstructorPublicLink.findUnique({
            where: { token },
            include: WITH_DOMAIN,
        });
    }

    revoke(id: string, now: Date): Promise<PublicLinkWithDomain> {
        return this.prisma.konstructorPublicLink.update({
            where: { id },
            data: { revokedAt: now, updatedAt: now },
            include: WITH_DOMAIN,
        });
    }

    async revokeAllNotRevoked(now: Date): Promise<number> {
        const { count } = await this.prisma.konstructorPublicLink.updateMany({
            where: { revokedAt: null },
            data: { revokedAt: now, updatedAt: now },
        });
        return count;
    }

    async registerView(id: string, now: Date): Promise<void> {
        await this.prisma.konstructorPublicLink.update({
            where: { id },
            data: { viewCount: { increment: 1 }, lastViewedAt: now },
        });
    }
}
