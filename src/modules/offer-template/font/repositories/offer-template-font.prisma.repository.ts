import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { OfferTemplateFontRepository } from './offer-template-font.repository';
import { OfferTemplateFont } from '../';

@Injectable()
export class OfferTemplateFontPrismaRepository
    implements OfferTemplateFontRepository
{
    constructor(private readonly prisma: PrismaService) {}

    async findById(id: bigint): Promise<OfferTemplateFont | null> {
        const result = (await this.prisma.offerTemplateFont.findUnique({
            where: { id },
            include: {
                offer_templates: true,
            },
        })) as Partial<OfferTemplateFont> | null;

        return result ? new OfferTemplateFont(result) : null;
    }

    async findMany(filters?: {
        offer_template_id?: bigint;
    }): Promise<OfferTemplateFont[]> {
        const where: any = {};

        if (filters?.offer_template_id) {
            where.offer_template_id = filters.offer_template_id;
        }

        const results = (await this.prisma.offerTemplateFont.findMany({
            where,
            include: {
                offer_templates: true,
            },
            orderBy: { created_at: 'desc' },
        })) as Partial<OfferTemplateFont>[];

        return results.map(result => new OfferTemplateFont(result));
    }

    async findWithRelations(id: bigint): Promise<OfferTemplateFont | null> {
        const result = (await this.prisma.offerTemplateFont.findUnique({
            where: { id },
            include: {
                offer_templates: true,
            },
        })) as Partial<OfferTemplateFont> | null;

        return result ? new OfferTemplateFont(result) : null;
    }

    async create(data: Partial<OfferTemplateFont>): Promise<OfferTemplateFont> {
        const result = (await this.prisma.offerTemplateFont.create({
            data: {
                offer_template_id: data.offer_template_id!,
                name: data.name!,
                code: data.code!,
                data: data.data,
                items: data.items,
                current: data.current,
                settings: data.settings,
            },
        })) as Partial<OfferTemplateFont>;

        return new OfferTemplateFont(result);
    }

    async update(
        id: bigint,
        data: Partial<OfferTemplateFont>,
    ): Promise<OfferTemplateFont> {
        const result = (await this.prisma.offerTemplateFont.update({
            where: { id },
            data: {
                ...(data.offer_template_id && {
                    offer_template_id: data.offer_template_id,
                }),
                ...(data.name && { name: data.name }),
                ...(data.code && { code: data.code }),
                ...(data.data !== undefined && { data: data.data }),
                ...(data.items !== undefined && { items: data.items }),
                ...(data.current !== undefined && { current: data.current }),
                ...(data.settings !== undefined && { settings: data.settings }),
            },
        })) as Partial<OfferTemplateFont>;

        return new OfferTemplateFont(result);
    }

    async delete(id: bigint): Promise<void> {
        await this.prisma.offerTemplateFont.delete({
            where: { id },
        });
    }

    async findByTemplate(template_id: bigint): Promise<OfferTemplateFont[]> {
        const results = (await this.prisma.offerTemplateFont.findMany({
            where: {
                offer_template_id: template_id,
            },
            include: {
                offer_templates: true,
            },
            orderBy: { created_at: 'desc' },
        })) as Partial<OfferTemplateFont>[];

        return results.map(result => new OfferTemplateFont(result));
    }
}
