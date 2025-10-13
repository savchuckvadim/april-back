import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { OfferTemplatePageRepository } from './offer-template-page.repository';
import { OfferTemplatePage } from '../entities/offer-template-page.entity';

@Injectable()
export class OfferTemplatePagePrismaRepository
    implements OfferTemplatePageRepository
{
    constructor(private readonly prisma: PrismaService) {}

    async findById(id: bigint): Promise<OfferTemplatePage | null> {
        const result = (await this.prisma.offerTemplatePage.findUnique({
            where: { id },
            include: {
                offerTemplate: true,
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
        })) as Partial<OfferTemplatePage> | null;

        return result ? new OfferTemplatePage(result) : null;
    }

    async findMany(filters?: {
        offer_template_id?: bigint;
        type?:
            | 'letter'
            | 'description'
            | 'infoblocks'
            | 'price'
            | 'lt'
            | 'other'
            | 'default';
        is_active?: boolean;
    }): Promise<OfferTemplatePage[]> {
        const where: any = {};

        if (filters?.offer_template_id) {
            where.offer_template_id = filters.offer_template_id;
        }

        if (filters?.type) {
            where.type = filters.type;
        }

        if (filters?.is_active !== undefined) {
            where.is_active = filters.is_active;
        }

        const results = (await this.prisma.offerTemplatePage.findMany({
            where,
            include: {
                offerTemplate: true,
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
        }));

        if (!results) return [];

        const entities = results.map(result => ({
            ...result,
            offerTemplate: result.offerTemplate ? {
                ...result.offerTemplate,
                id: String(result.offerTemplate.id),
            } : undefined,
        } as Partial<OfferTemplatePage>));

        return entities.map(entity => new OfferTemplatePage(entity));
    }

    async findWithRelations(id: bigint): Promise<OfferTemplatePage | null> {
        const result = (await this.prisma.offerTemplatePage.findUnique({
            where: { id },
            include: {
                offerTemplate: true,
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
        })) as Partial<OfferTemplatePage> | null;

        return result ? new OfferTemplatePage(result) : null;
    }

    async create(data: Partial<OfferTemplatePage>): Promise<OfferTemplatePage> {
        const result = (await this.prisma.offerTemplatePage.create({
            data: {
                offer_template_id: data.offer_template_id!,
                order: data.order!,
                name: data.name!,
                code: data.code,
                type: data.type!,
                is_active: data.is_active!,
                settings: data.settings,
                stickers: data.stickers,
                background: data.background,
                colors: data.colors,
                fonts: data.fonts,
            },
        })) as Partial<OfferTemplatePage>;

        return new OfferTemplatePage(result);
    }

    async update(
        id: bigint,
        data: Partial<OfferTemplatePage>,
    ): Promise<OfferTemplatePage> {
        const result = (await this.prisma.offerTemplatePage.update({
            where: { id },
            data: {
                ...(data.offer_template_id && {
                    offer_template_id: data.offer_template_id,
                }),
                ...(data.order !== undefined && { order: data.order }),
                ...(data.name && { name: data.name }),
                ...(data.code !== undefined && { code: data.code }),
                ...(data.type && { type: data.type }),
                ...(data.is_active !== undefined && {
                    is_active: data.is_active,
                }),
                ...(data.settings !== undefined && { settings: data.settings }),
                ...(data.stickers !== undefined && { stickers: data.stickers }),
                ...(data.background !== undefined && {
                    background: data.background,
                }),
                ...(data.colors !== undefined && { colors: data.colors }),
                ...(data.fonts !== undefined && { fonts: data.fonts }),
            },
        })) as Partial<OfferTemplatePage>;

        return new OfferTemplatePage(result);
    }

    async delete(id: bigint): Promise<void> {
        await this.prisma.offerTemplatePage.delete({
            where: { id },
        });
    }

    async findByTemplate(template_id: bigint): Promise<OfferTemplatePage[]> {
        const results = (await this.prisma.offerTemplatePage.findMany({
            where: {
                offer_template_id: template_id,
            },
            include: {
                offerTemplate: true,
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
        }));

        if (!results) return [];

        const entities = results.map(result => ({
            ...result,
            offerTemplate: result.offerTemplate ? {
                ...result.offerTemplate,
                id: String(result.offerTemplate.id),
            } : undefined,
        } as Partial<OfferTemplatePage>));

        return entities.map(entity => new OfferTemplatePage(entity));
    }

    async findByTemplateWithBlocks(
        template_id: bigint,
    ): Promise<OfferTemplatePage[]> {
        const results = (await this.prisma.offerTemplatePage.findMany({
            where: {
                offer_template_id: template_id,
                is_active: true,
            },
            include: {
                offerTemplate: true,
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
        }));

        if (!results) return [];

        const entities = results.map(result => ({
            ...result,
            offerTemplate: result.offerTemplate ? {
                ...result.offerTemplate,
                id: String(result.offerTemplate.id),
            } : undefined,
        } as Partial<OfferTemplatePage>));

        return entities.map(entity => new OfferTemplatePage(entity));
    }
}
