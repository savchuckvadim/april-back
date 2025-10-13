import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { OfferTemplateImageRepository } from './offer-template-image.repository';
import { OfferTemplateImage } from '../';

@Injectable()
export class OfferTemplateImagePrismaRepository
    implements OfferTemplateImageRepository
{
    constructor(private readonly prisma: PrismaService) {}

    async findById(id: bigint): Promise<OfferTemplateImage | null> {
        const result = (await this.prisma.offerTemplateImage.findUnique({
            where: { id },
            include: {
                offerTemplatePageBlocks: true,
                offerTemplatePageStickers: true,
            },
        })) as Partial<OfferTemplateImage> | null;

        return result ? new OfferTemplateImage(result) : null;
    }

    async findMany(filters?: {
        portal_id?: bigint;
        storage_type?: 'app' | 'public' | 'private';
        parent?: 'template' | 'page' | 'block' | 'sticker' | 'other';
        is_public?: boolean;
    }): Promise<OfferTemplateImage[]> {
        const where: any = {};

        if (filters?.portal_id) {
            where.portal_id = filters.portal_id;
        }

        if (filters?.storage_type) {
            where.storage_type = filters.storage_type;
        }

        if (filters?.parent) {
            where.parent = filters.parent;
        }

        if (filters?.is_public !== undefined) {
            where.is_public = filters.is_public;
        }

        const results = (await this.prisma.offerTemplateImage.findMany({
            where,
            include: {
                offerTemplatePageBlocks: true,
                offerTemplatePageStickers: true,
            },
            orderBy: { created_at: 'desc' },
        })) as Partial<OfferTemplateImage>[];

        return results.map(result => new OfferTemplateImage(result));
    }

    async findWithRelations(id: bigint): Promise<OfferTemplateImage | null> {
        const result = (await this.prisma.offerTemplateImage.findUnique({
            where: { id },
            include: {
                offerTemplatePageBlocks: true,
                offerTemplatePageStickers: true,
            },
        })) as Partial<OfferTemplateImage> | null;

        return result ? new OfferTemplateImage(result) : null;
    }

    async create(
        data: Partial<OfferTemplateImage>,
    ): Promise<OfferTemplateImage> {
        const result = (await this.prisma.offerTemplateImage.create({
            data: {
                path: data.path!,
                storage_type: data.storage_type!,
                original_name: data.original_name,
                mime: data.mime,
                size: data.size!,
                height: data.height!,
                width: data.width!,
                position: data.position,
                style: data.style,
                settings: data.settings,
                is_public: data.is_public!,
                parent: data.parent!,
                bitrix_user_id: data.bitrix_user_id,
                domain: data.domain,
                portal_id: data.portal_id,
            },
        })) as Partial<OfferTemplateImage>;

        return new OfferTemplateImage(result);
    }

    async update(
        id: bigint,
        data: Partial<OfferTemplateImage>,
    ): Promise<OfferTemplateImage> {
        const result = (await this.prisma.offerTemplateImage.update({
            where: { id },
            data: {
                ...(data.path && { path: data.path }),
                ...(data.storage_type && { storage_type: data.storage_type }),
                ...(data.original_name !== undefined && {
                    original_name: data.original_name,
                }),
                ...(data.mime !== undefined && { mime: data.mime }),
                ...(data.size && { size: data.size }),
                ...(data.height && { height: data.height }),
                ...(data.width && { width: data.width }),
                ...(data.position !== undefined && { position: data.position }),
                ...(data.style !== undefined && { style: data.style }),
                ...(data.settings !== undefined && { settings: data.settings }),
                ...(data.is_public !== undefined && {
                    is_public: data.is_public,
                }),
                ...(data.parent && { parent: data.parent }),
                ...(data.bitrix_user_id !== undefined && {
                    bitrix_user_id: data.bitrix_user_id,
                }),
                ...(data.domain !== undefined && { domain: data.domain }),
                ...(data.portal_id !== undefined && {
                    portal_id: data.portal_id,
                }),
            },
        })) as Partial<OfferTemplateImage>;

        return new OfferTemplateImage(result);
    }

    async delete(id: bigint): Promise<void> {
        await this.prisma.offerTemplateImage.delete({
            where: { id },
        });
    }

    async findByPortal(portal_id: bigint): Promise<OfferTemplateImage[]> {
        const results = (await this.prisma.offerTemplateImage.findMany({
            where: {
                portal_id,
            },
            include: {
                offerTemplatePageBlocks: true,
                offerTemplatePageStickers: true,
            },
            orderBy: { created_at: 'desc' },
        })) as Partial<OfferTemplateImage>[];

        return results.map(result => new OfferTemplateImage(result));
    }

    async findByParent(
        parent: 'template' | 'page' | 'block' | 'sticker' | 'other',
    ): Promise<OfferTemplateImage[]> {
        const results = (await this.prisma.offerTemplateImage.findMany({
            where: {
                parent,
            },
            include: {
                offerTemplatePageBlocks: true,
                offerTemplatePageStickers: true,
            },
            orderBy: { created_at: 'desc' },
        })) as Partial<OfferTemplateImage>[];

        return results.map(result => new OfferTemplateImage(result));
    }
}
