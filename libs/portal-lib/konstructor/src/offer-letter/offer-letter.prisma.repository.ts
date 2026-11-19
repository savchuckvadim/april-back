import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import {
    LegacyOfferLetter,
    OfferLetterEntity,
    OfferLetterScope,
} from './offer-letter.entity';
import {
    CreateOfferLetterData,
    OfferLetterRepository,
    UpdateOfferLetterData,
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

    async findById(id: string): Promise<OfferLetterEntity | null> {
        const row = await this.prisma.offerLetter.findUnique({ where: { id } });
        return row ? createOfferLetterEntityFromPrisma(row) : null;
    }

    async portalExists(portalId: number): Promise<boolean> {
        const count = await this.prisma.portal.count({
            where: { id: BigInt(portalId) },
        });
        return count > 0;
    }

    async findPortalDefault(domain: string): Promise<OfferLetterEntity | null> {
        const row = await this.prisma.offerLetter.findFirst({
            where: {
                portal: { domain },
                bxUserId: null,
                isDefault: true,
                isActive: true,
            },
            orderBy: { updatedAt: 'desc' },
        });
        return row ? createOfferLetterEntityFromPrisma(row) : null;
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
        // У Laravel-таблицы нет значений по умолчанию для timestamps: без них
        // created_at/updated_at остаются NULL
        const now = new Date();
        const row = await this.prisma.offerLetter.create({
            data: {
                id: randomUUID(),
                createdAt: now,
                updatedAt: now,
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

    async update(
        id: string,
        data: UpdateOfferLetterData,
    ): Promise<OfferLetterEntity | null> {
        const existing = await this.prisma.offerLetter.findUnique({
            where: { id },
            select: { id: true },
        });
        if (!existing) return null;
        const row = await this.prisma.offerLetter.update({
            where: { id },
            data: {
                name: data.name,
                text: data.text,
                isActive: data.isActive,
                sort: data.sort,
                updatedAt: new Date(),
            },
        });
        return createOfferLetterEntityFromPrisma(row);
    }

    async delete(id: string): Promise<boolean> {
        const { count } = await this.prisma.offerLetter.deleteMany({
            where: { id },
        });
        return count > 0;
    }

    async setScopeDefault(
        scope: OfferLetterScope,
        defaultId: string | null,
    ): Promise<void> {
        const where = {
            portalId: BigInt(scope.portalId),
            bxUserId: scope.bxUserId,
        };
        const now = new Date();
        await this.prisma.$transaction([
            this.prisma.offerLetter.updateMany({
                where: {
                    ...where,
                    isDefault: true,
                    ...(defaultId ? { id: { not: defaultId } } : {}),
                },
                data: { isDefault: false, updatedAt: now },
            }),
            ...(defaultId
                ? [
                      this.prisma.offerLetter.updateMany({
                          where: { ...where, id: defaultId, isDefault: false },
                          data: { isDefault: true, updatedAt: now },
                      }),
                  ]
                : []),
        ]);
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
