import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { LegacyOfferLetter, OfferLetterEntity } from './offer-letter.entity';
import {
    CreateOfferLetterData,
    OfferLetterRepository,
} from './offer-letter.repository';
import { createOfferLetterEntityFromPrisma } from './lib/offer-letter-entity.util';
import {
    LEGACY_OFFER_TEMPLATE_CODE,
    legacyLetterOf,
} from './lib/legacy-offer-letter.util';

@Injectable()
export class OfferLetterPrismaRepository implements OfferLetterRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findByPortal(portalId: number): Promise<OfferLetterEntity[]> {
        const rows = await this.prisma.offerLetter.findMany({
            where: { portalId: BigInt(portalId) },
            orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
        });
        return rows.map(createOfferLetterEntityFromPrisma);
    }

    async findImportedLegacyFieldIds(fieldIds: number[]): Promise<number[]> {
        if (!fieldIds.length) return [];
        const rows = await this.prisma.offerLetter.findMany({
            where: { legacyFieldId: { in: fieldIds } },
            select: { legacyFieldId: true },
        });
        return rows.flatMap(row =>
            row.legacyFieldId === null ? [] : [row.legacyFieldId],
        );
    }

    async create(data: CreateOfferLetterData): Promise<OfferLetterEntity> {
        const row = await this.prisma.offerLetter.create({
            data: {
                id: randomUUID(),
                portalId: BigInt(data.portalId),
                bxUserId: data.bxUserId,
                name: data.name,
                text: data.text,
                isDefault: data.isDefault,
                isActive: data.isActive ?? true,
                sort: data.sort ?? 0,
                legacyFieldId: data.legacyFieldId ?? null,
            },
        });
        return createOfferLetterEntityFromPrisma(row);
    }

    async findLegacyPortalLetters(): Promise<LegacyOfferLetter[]> {
        const templates = await this.prisma.template.findMany({
            where: { code: LEGACY_OFFER_TEMPLATE_CODE },
            orderBy: { id: 'asc' },
            select: {
                id: true,
                portalId: true,
                portal: { select: { domain: true } },
                template_field: {
                    select: {
                        fields: {
                            select: {
                                id: true,
                                code: true,
                                value: true,
                                description: true,
                            },
                        },
                    },
                },
            },
        });
        return templates.flatMap(template => {
            const letter = legacyLetterOf({
                id: template.id,
                portalId: template.portalId,
                domain: template.portal.domain,
                fields: template.template_field.flatMap(link =>
                    link.fields ? [link.fields] : [],
                ),
            });
            return letter ? [letter] : [];
        });
    }
}
