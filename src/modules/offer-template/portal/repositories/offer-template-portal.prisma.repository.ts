import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { OfferTemplatePortalRepository } from './offer-template-portal.repository';
import { OfferTemplatePortal } from '../entities/offer-template-portal.entity';

@Injectable()
export class OfferTemplatePortalPrismaRepository
    implements OfferTemplatePortalRepository {
    constructor(private readonly prisma: PrismaService) { }

    async findById(id: bigint): Promise<OfferTemplatePortal | null> {
        const result = (await this.prisma.offerTemplatePortal.findUnique({
            where: { id },
            include: {
                offer_templates: true,
            },
        })) as Partial<OfferTemplatePortal> | null;

        return result ? new OfferTemplatePortal(result) : null;
    }

    async findMany(filters?: {
        offer_template_id?: bigint;
        portal_id?: bigint;
        is_active?: boolean;
        is_default?: boolean;
    }): Promise<OfferTemplatePortal[]> {
        const where: any = {};

        if (filters?.offer_template_id) {
            where.offer_template_id = filters.offer_template_id;
        }

        if (filters?.portal_id) {
            where.portal_id = filters.portal_id;
        }

        if (filters?.is_active !== undefined) {
            where.is_active = filters.is_active;
        }

        if (filters?.is_default !== undefined) {
            where.is_default = filters.is_default;
        }

        const results = (await this.prisma.offerTemplatePortal.findMany({
            where,
            include: {
                offer_templates: true,
            },
            orderBy: { created_at: 'desc' },
        }));

        if (!results) return [];


        const entities = results.map(result => ({
            ...result,
            offer_templates: result.offer_templates ? {
                ...result.offer_templates,
                id: String(result.offer_templates.id),
            } : undefined,
        } as Partial<OfferTemplatePortal>));


        return entities.map(entity => new OfferTemplatePortal(entity));
    }

    async findWithRelations(id: bigint): Promise<OfferTemplatePortal | null> {
        const result = (await this.prisma.offerTemplatePortal.findUnique({
            where: { id },
            include: {
                offer_templates: true,
            },
        })) as Partial<OfferTemplatePortal> | null;

        return result ? new OfferTemplatePortal(result) : null;
    }

    async create(
        data: Partial<OfferTemplatePortal>,
    ): Promise<OfferTemplatePortal> {
        const result = (await this.prisma.offerTemplatePortal.create({
            data: {
                offer_template_id: data.offer_template_id!,
                portal_id: data.portal_id!,
                is_default: data.is_default!,
                is_active: data.is_active!,
            },
        })) as Partial<OfferTemplatePortal>;

        return new OfferTemplatePortal(result);
    }

    async update(
        id: bigint,
        data: Partial<OfferTemplatePortal>,
    ): Promise<OfferTemplatePortal> {
        const result = (await this.prisma.offerTemplatePortal.update({
            where: { id },
            data: {
                ...(data.offer_template_id && {
                    offer_template_id: data.offer_template_id,
                }),
                ...(data.portal_id && { portal_id: data.portal_id }),
                ...(data.is_default !== undefined && {
                    is_default: data.is_default,
                }),
                ...(data.is_active !== undefined && {
                    is_active: data.is_active,
                }),
            },
        })) as Partial<OfferTemplatePortal>;

        return new OfferTemplatePortal(result);
    }

    async delete(id: bigint): Promise<void> {
        await this.prisma.offerTemplatePortal.delete({
            where: { id },
        });
    }

    async findByPortal(portal_id: bigint): Promise<OfferTemplatePortal[]> {
        const results = (await this.prisma.offerTemplatePortal.findMany({
            where: {
                portal_id,
            },
            include: {
                offer_templates: true,
            },
            orderBy: { created_at: 'desc' },
        }));

        if (!results) return [];

        const entities = results.map(result => ({
            ...result,
            offer_templates: result.offer_templates ? {
                ...result.offer_templates,
                id: String(result.offer_templates.id),
            } : undefined,
        } as Partial<OfferTemplatePortal>));

        return entities.map(entity => new OfferTemplatePortal(entity));
    }

    async findByTemplate(template_id: bigint): Promise<OfferTemplatePortal[]> {
        const results = (await this.prisma.offerTemplatePortal.findMany({
            where: {
                offer_template_id: template_id,
            },
            include: {
                offer_templates: true,
            },
            orderBy: { created_at: 'desc' },
        }));

        if (!results) return [];

        const entities = results.map(result => ({
            ...result,
            offer_templates: result.offer_templates ? {
                ...result.offer_templates,
                id: String(result.offer_templates.id),
            } : undefined,
        } as Partial<OfferTemplatePortal>));

        return entities.map(entity => new OfferTemplatePortal(entity));
    }

    async findActiveByPortal(
        portal_id: bigint,
    ): Promise<OfferTemplatePortal[]> {
        const results = (await this.prisma.offerTemplatePortal.findMany({
            where: {
                portal_id,
                is_active: true,
            },
            include: {
                offer_templates: true,
            },
            orderBy: { created_at: 'desc' },
        }));

        if (!results) return [];

        const entities = results.map(result => ({
            ...result,
            offer_templates: result.offer_templates ? {
                ...result.offer_templates,
                id: String(result.offer_templates.id),
            } : undefined,
        } as Partial<OfferTemplatePortal>));

        return entities.map(entity => new OfferTemplatePortal(entity));
    }
}
