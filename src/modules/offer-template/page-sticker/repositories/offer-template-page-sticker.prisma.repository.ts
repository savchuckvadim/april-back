import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { OfferTemplatePageStickerRepository } from './offer-template-page-sticker.repository';
import { OfferTemplatePageSticker } from '../entities/offer-template-page-sticker.entity';

@Injectable()
export class OfferTemplatePageStickerPrismaRepository
    implements OfferTemplatePageStickerRepository
{
    constructor(private readonly prisma: PrismaService) {}

    async findById(id: bigint): Promise<OfferTemplatePageSticker | null> {
        const result = (await this.prisma.offerTemplatePageSticker.findUnique({
            where: { id },
            include: {
                offerTemplateImages: true,
                offerTemplatePages: true,
            },
        })) as Partial<OfferTemplatePageSticker>;

        return result ? new OfferTemplatePageSticker(result) : null;
    }

    async findMany(filters?: {
        offer_template_page_id?: bigint;
    }): Promise<OfferTemplatePageSticker[]> {
        const where: any = {};

        if (filters?.offer_template_page_id) {
            where.offer_template_page_id = filters.offer_template_page_id;
        }

        const results = (await this.prisma.offerTemplatePageSticker.findMany({
            where,
            include: {
                offerTemplateImages: true,
                offerTemplatePages: true,
            },
            orderBy: { order: 'asc' },
        })) as Partial<OfferTemplatePageSticker>[];

        return results.map(result => new OfferTemplatePageSticker(result));
    }

    async findWithRelations(
        id: bigint,
    ): Promise<OfferTemplatePageSticker | null> {
        const result = (await this.prisma.offerTemplatePageSticker.findUnique({
            where: { id },
            include: {
                offerTemplateImages: true,
                offerTemplatePages: {
                    include: {
                        offerTemplate: true,
                    },
                },
            },
        })) as Partial<OfferTemplatePageSticker> | null;

        return result ? new OfferTemplatePageSticker(result) : null;
    }

    async create(
        data: Partial<OfferTemplatePageSticker>,
    ): Promise<OfferTemplatePageSticker> {
        const result = (await this.prisma.offerTemplatePageSticker.create({
            data: {
                offer_template_page_id: data.offer_template_page_id!,
                order: data.order!,
                name: data.name!,
                code: data.code,
                size: data.size!,
                height: data.height!,
                width: data.width!,
                position: data.position,
                style: data.style,
                settings: data.settings,
                background: data.background,
                colors: data.colors,
                image_id: data.image_id,
            },
        })) as Partial<OfferTemplatePageSticker>;

        return new OfferTemplatePageSticker(result);
    }

    async update(
        id: bigint,
        data: Partial<OfferTemplatePageSticker>,
    ): Promise<OfferTemplatePageSticker> {
        const result = (await this.prisma.offerTemplatePageSticker.update({
            where: { id },
            data: {
                ...(data.offer_template_page_id && {
                    offer_template_page_id: data.offer_template_page_id,
                }),
                ...(data.order !== undefined && { order: data.order }),
                ...(data.name && { name: data.name }),
                ...(data.code !== undefined && { code: data.code }),
                ...(data.size && { size: data.size }),
                ...(data.height && { height: data.height }),
                ...(data.width && { width: data.width }),
                ...(data.position !== undefined && { position: data.position }),
                ...(data.style !== undefined && { style: data.style }),
                ...(data.settings !== undefined && { settings: data.settings }),
                ...(data.background !== undefined && {
                    background: data.background,
                }),
                ...(data.colors !== undefined && { colors: data.colors }),
                ...(data.image_id !== undefined && { image_id: data.image_id }),
            },
        })) as Partial<OfferTemplatePageSticker>;

        return new OfferTemplatePageSticker(result);
    }

    async delete(id: bigint): Promise<void> {
        await this.prisma.offerTemplatePageSticker.delete({
            where: { id },
        });
    }

    async findByPage(page_id: bigint): Promise<OfferTemplatePageSticker[]> {
        const results = (await this.prisma.offerTemplatePageSticker.findMany({
            where: {
                offer_template_page_id: page_id,
            },
            include: {
                offerTemplateImages: true,
                offerTemplatePages: true,
            },
            orderBy: { order: 'asc' },
        })) as Partial<OfferTemplatePageSticker>[];

        return results.map(result => new OfferTemplatePageSticker(result));
    }

    async findByPageOrdered(
        page_id: bigint,
    ): Promise<OfferTemplatePageSticker[]> {
        const results = (await this.prisma.offerTemplatePageSticker.findMany({
            where: {
                offer_template_page_id: page_id,
            },
            include: {
                offerTemplateImages: true,
                offerTemplatePages: true,
            },
            orderBy: [{ order: 'asc' }, { created_at: 'asc' }],
        })) as Partial<OfferTemplatePageSticker>[];

        return results.map(result => new OfferTemplatePageSticker(result));
    }
}
