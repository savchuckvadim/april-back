import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { OfferTemplateRepository } from './offer-template.repository';
import { OfferTemplate, OfferTemplateSummary } from '../';
import { Prisma } from 'generated/prisma';
import type { OfferTemplateFilters } from '../types/offer-template-filters.type';

@Injectable()
export class OfferTemplatePrismaRepository implements OfferTemplateRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findById(id: bigint): Promise<OfferTemplate | null> {
        const result = (await this.prisma.offerTemplate.findUnique({
            where: { id },
            include: {
                offerTemplateFonts: true,
                offerTemplatePages: {
                    include: {
                        offerTemplatePageBlocks: {
                            include: {
                                offerTemplateImage: true,
                            },
                        },
                        offerTemplatePageStickers: {
                            include: {
                                offerTemplateImages: true,
                            },
                        },
                    },
                },
                offerTemplatePortal: true,
                userSelectedTemplates: true,
            },
        })) as Partial<OfferTemplate> | null;
        const entity = await this.prepareToEntityWithPortalId(result);
        return entity ? new OfferTemplate(entity) : null;
    }

    async findMany(
        filters?: OfferTemplateFilters,
    ): Promise<OfferTemplateSummary[]> {
        const where: Prisma.OfferTemplateWhereInput = {};

        if (filters?.visibility) {
            where.visibility = filters.visibility;
        }

        if (filters?.is_active !== undefined) {
            where.is_active = filters.is_active;
        }

        if (filters?.search) {
            where.OR = [
                { name: { contains: filters.search } },
                { code: { contains: filters.search } },
                { tags: { contains: filters.search } },
            ];
        }

        if (filters?.portal_id) {
            where.offerTemplatePortal = {
                some: {
                    portal_id: filters.portal_id,
                },
            };
        }

        const results = (await this.prisma.offerTemplate.findMany({
            where,
            select: {
                id: true,
                name: true,
                visibility: true,
                creator_bitrix_user_id: true,
                is_archived: true,
                archived_at: true,
                is_default: true,
                type: true,
                style: true,
                color: true,
                code: true,
                is_active: true,
                counter: true,
                created_at: true,
                tags: true,
            },
            orderBy: { created_at: 'desc' },
        })) as Partial<OfferTemplateSummary>[];
        const resultEntities: (OfferTemplateSummary | undefined)[] = [];
        for (const result of results) {
            // const portalId = await this.getPortalIdByTemplateId(
            //     BigInt(!result.id),
            // );
            // console.log(portalId, 'portalId');
            const entity =
                await this.prepareToEntitySummaryWithPortalId(result);
            resultEntities.push(
                entity ? new OfferTemplateSummary(entity) : undefined,
            );
        }
        return resultEntities.filter(entity => entity !== undefined);
    }

    async findWithRelations(id: bigint): Promise<OfferTemplate | null> {
        const result = (await this.prisma.offerTemplate.findUnique({
            where: { id },
            include: {
                offerTemplateFonts: true,
                offerTemplatePages: {
                    include: {
                        offerTemplatePageBlocks: {
                            include: {
                                offerTemplateImage: true,
                            },
                            orderBy: { order: 'asc' },
                        },
                        offerTemplatePageStickers: {
                            include: {
                                offerTemplateImages: true,
                            },
                            orderBy: { order: 'asc' },
                        },
                    },
                    orderBy: { order: 'asc' },
                },
                offerTemplatePortal: true,
                userSelectedTemplates: true,
            },
        })) as Partial<OfferTemplate> | null;

        return result ? new OfferTemplate(result) : null;
    }

    async create(data: Partial<OfferTemplate>): Promise<OfferTemplate> {
        console.log('OFFER TEMPLATE CREATE');
        console.log(data, 'data');
        const result = await this.prisma.offerTemplate.create({
            data: {
                name: data.name!,
                visibility: data.visibility!,
                is_default: data.is_default!,
                file_path: data.file_path!,
                demo_path: data.demo_path,
                type: data.type!,
                rules: data.rules,
                price_settings: data.price_settings,
                infoblock_settings: data.infoblock_settings,
                letter_text: data.letter_text,
                sale_text_1: data.sale_text_1,
                sale_text_2: data.sale_text_2,
                sale_text_3: data.sale_text_3,
                sale_text_4: data.sale_text_4,
                sale_text_5: data.sale_text_5,
                field_codes: data.field_codes,
                style: data.style,
                color: data.color,
                code: data.code!,
                tags: data.tags,
                is_active: data.is_active!,
                counter: data.counter!,
                creator_bitrix_user_id: data.creator_bitrix_user_id,
                created_at: new Date(),
            },
        });
        console.log(result, 'OFFER TEMPLATE CREATE result');
        const entity = {
            ...result,
            id: String(result.id),
        } as Partial<OfferTemplate>;
        return new OfferTemplate(entity);
    }

    async update(
        id: bigint,
        data: Partial<OfferTemplate>,
    ): Promise<OfferTemplate> {
        const result = await this.prisma.offerTemplate.update({
            where: { id },
            data: {
                ...(data.name && { name: data.name }),
                ...(data.visibility && { visibility: data.visibility }),
                ...(data.is_default !== undefined && {
                    is_default: data.is_default,
                }),
                ...(data.file_path && { file_path: data.file_path }),
                ...(data.demo_path !== undefined && {
                    demo_path: data.demo_path,
                }),
                ...(data.type && { type: data.type }),
                ...(data.rules !== undefined && { rules: data.rules }),
                ...(data.price_settings !== undefined && {
                    price_settings: data.price_settings,
                }),
                ...(data.infoblock_settings !== undefined && {
                    infoblock_settings: data.infoblock_settings,
                }),
                ...(data.letter_text !== undefined && {
                    letter_text: data.letter_text,
                }),
                ...(data.sale_text_1 !== undefined && {
                    sale_text_1: data.sale_text_1,
                }),
                ...(data.sale_text_2 !== undefined && {
                    sale_text_2: data.sale_text_2,
                }),
                ...(data.sale_text_3 !== undefined && {
                    sale_text_3: data.sale_text_3,
                }),
                ...(data.sale_text_4 !== undefined && {
                    sale_text_4: data.sale_text_4,
                }),
                ...(data.sale_text_5 !== undefined && {
                    sale_text_5: data.sale_text_5,
                }),
                ...(data.field_codes !== undefined && {
                    field_codes: data.field_codes,
                }),
                ...(data.style !== undefined && { style: data.style }),
                ...(data.color !== undefined && { color: data.color }),
                ...(data.code && { code: data.code }),
                ...(data.tags !== undefined && { tags: data.tags }),
                ...(data.is_active !== undefined && {
                    is_active: data.is_active,
                }),
                ...(data.counter !== undefined && { counter: data.counter }),
                updated_at: new Date(),
            },
        });
        const entity = {
            ...result,
            id: String(result.id),
        } as Partial<OfferTemplate>;
        return new OfferTemplate(entity);
    }

    async delete(id: bigint): Promise<void> {
        await this.prisma.offerTemplate.delete({
            where: { id },
        });
    }

    async findByPortal(portal_id: bigint): Promise<OfferTemplateSummary[]> {
        const results = (await this.prisma.offerTemplate.findMany({
            where: {
                visibility: 'private',
                is_active: true,
                is_archived: false,
                offerTemplatePortal: {
                    some: {
                        portal_id,
                    },
                },
            },
            select: {
                id: true,
                name: true,
                visibility: true,
                is_default: true,
                type: true,
                style: true,
                color: true,
                code: true,
                tags: true,
                creator_bitrix_user_id: true,
                is_archived: true,
                archived_at: true,
                is_active: true,
                counter: true,
                created_at: true,
                offerTemplatePortal: {
                    select: {
                        portal_id: true,
                    },
                },
            },
            orderBy: { created_at: 'desc' },
        })) as Partial<OfferTemplateSummary>[];

        const resultEntities: (OfferTemplateSummary | undefined)[] = [];
        for (const result of results) {
            const entity =
                await this.prepareToEntitySummaryWithPortalId(result);
            resultEntities.push(
                entity ? new OfferTemplateSummary(entity) : undefined,
            );
        }
        return resultEntities.filter(entity => entity !== undefined);
    }

    async findPublic(): Promise<OfferTemplateSummary[]> {
        const results = (await this.prisma.offerTemplate.findMany({
            where: {
                visibility: 'public',
                is_active: true,
            },
            select: {
                id: true,
                name: true,
                visibility: true,
                is_default: true,
                type: true,
                style: true,
                color: true,
                code: true,
                tags: true,
                creator_bitrix_user_id: true,
                is_archived: true,
                archived_at: true,
                is_active: true,
                counter: true,
                created_at: true,
                offerTemplatePortal: {
                    select: {
                        portal_id: true,
                    },
                },
            },
            orderBy: { created_at: 'desc' },
        })) as Partial<OfferTemplateSummary>[];

        return results.map(result => new OfferTemplateSummary(result));
    }

    async findUserTemplates(
        user_id: bigint,
        portal_id: bigint,
    ): Promise<OfferTemplateSummary[]> {
        const results = (await this.prisma.offerTemplate.findMany({
            where: {
                visibility: 'user',
                is_active: true,
                is_archived: false,
                creator_bitrix_user_id: user_id,
                offerTemplatePortal: {
                    some: {
                        portal_id: portal_id,
                    },
                },
            },
            select: {
                id: true,
                name: true,
                visibility: true,
                is_default: true,
                type: true,
                style: true,
                color: true,
                code: true,
                tags: true,
                creator_bitrix_user_id: true,
                is_archived: true,
                archived_at: true,
                is_active: true,
                counter: true,
                created_at: true,
                offerTemplatePortal: {
                    select: {
                        portal_id: true,
                    },
                },
            },
            orderBy: { created_at: 'desc' },
        })) as Partial<OfferTemplateSummary>[];

        const resultEntities: (OfferTemplateSummary | undefined)[] = [];
        for (const result of results) {
            const entity =
                await this.prepareToEntitySummaryWithPortalId(result);
            resultEntities.push(
                entity ? new OfferTemplateSummary(entity) : undefined,
            );
        }
        return resultEntities.filter(entity => entity !== undefined);
    }

    async findFullUserTemplates(
        user_id: bigint,
        portal_id: bigint,
    ): Promise<OfferTemplate[]> {
        const results = (await this.prisma.offerTemplate.findMany({
            where: {
                creator_bitrix_user_id: user_id,
                offerTemplatePortal: {
                    some: {
                        portal_id: portal_id,
                    },
                },
                visibility: 'user',
                is_active: true,
                is_archived: false,
            },

            select: {
                id: true,
                name: true,
                visibility: true,
                is_default: true,
                type: true,
                style: true,
                color: true,
                code: true,
                creator_bitrix_user_id: true,
                is_archived: true,
                archived_at: true,

                tags: true,
                is_active: true,
                counter: true,
                created_at: true,
                offerTemplatePortal: true,
            },
            orderBy: { created_at: 'desc' },
        })) as Partial<OfferTemplateSummary>[];

        const resultEntities: OfferTemplate[] = [];
        for (const result of results) {
            const portalId = await this.getPortalIdByTemplateId(
                BigInt(!result.id),
            );
            console.log(portalId, 'portalId');
            resultEntities.push(
                new OfferTemplate({
                    ...result,
                    portal_id: portalId,
                } as Partial<OfferTemplate>),
            );
        }
        return resultEntities;
    }
    private async prepareToEntityWithPortalId(
        result: Partial<OfferTemplate> | null,
    ): Promise<Partial<OfferTemplate> | null> {
        if (!result) {
            return null;
        }
        const portalId = await this.getPortalIdByTemplateId(BigInt(!result.id));
        return portalId
            ? {
                  ...result,
                  portal_id: portalId,
              }
            : result;
    }

    private async prepareToEntitySummaryWithPortalId(
        result: Partial<OfferTemplateSummary> | null,
    ): Promise<Partial<OfferTemplateSummary> | null> {
        if (!result) {
            return null;
        }
        const portalId = await this.getPortalIdByTemplateId(BigInt(!result.id));
        return portalId
            ? {
                  ...result,
                  portal_id: portalId,
              }
            : result;
    }
    private async getPortalIdByTemplateId(
        templateId: bigint,
    ): Promise<number | undefined> {
        const portalTemplate = await this.prisma.offerTemplatePortal.findFirst({
            where: {
                offer_template_id: templateId,
            },
        });
        return portalTemplate
            ? Number(portalTemplate.portal_id.toString())
            : undefined;
    }
}
