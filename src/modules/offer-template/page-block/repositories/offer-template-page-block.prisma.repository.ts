import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { OfferTemplatePageBlockRepository } from './offer-template-page-block.repository';
import { OfferTemplatePageBlock } from '../entities/offer-template-page-block.entity';
import { OfferTemplatePageBlockDto } from '../dtos/offer-template-page-block.dto';
import { CreateOfferTemplatePageBlockDto } from '../dtos/create-offer-template-page-block.dto';

@Injectable()
export class OfferTemplatePageBlockPrismaRepository
    implements OfferTemplatePageBlockRepository {
    constructor(private readonly prisma: PrismaService) { }

    async findById(id: bigint): Promise<OfferTemplatePageBlock | null> {
        const result = (await this.prisma.offerTemplatePageBlock.findUnique({
            where: { id },
            include: {
                offerTemplateImage: true,
                offerTemplatePage: true,
            },
        })) as Partial<OfferTemplatePageBlock> | null;

        return result ? new OfferTemplatePageBlock(result) : null;
    }

    async findMany(filters?: {
        offer_template_page_id?: bigint;
        type?:
        | 'background'
        | 'about'
        | 'hero'
        | 'letter'
        | 'documentNumber'
        | 'manager'
        | 'logo'
        | 'stamp'
        | 'header'
        | 'footer'
        | 'infoblocks'
        | 'price'
        | 'slogan'
        | 'infoblocksDescription'
        | 'lt'
        | 'otherComplects'
        | 'comparison'
        | 'comparisonComplects'
        | 'comparisonIblocks'
        | 'user'
        | 'default';
    }): Promise<OfferTemplatePageBlock[]> {
        const where: any = {};

        if (filters?.offer_template_page_id) {
            where.offer_template_page_id = filters.offer_template_page_id;
        }

        if (filters?.type) {
            where.type = filters.type;
        }

        const results = (await this.prisma.offerTemplatePageBlock.findMany({
            where,
            include: {
                offerTemplateImage: true,
                offerTemplatePage: true,
            },
            orderBy: { order: 'asc' },
        })) as Partial<OfferTemplatePageBlock>[];

        return results.map(result => new OfferTemplatePageBlock(result));
    }

    async findWithRelations(
        id: bigint,
    ): Promise<OfferTemplatePageBlock | null> {
        const result = (await this.prisma.offerTemplatePageBlock.findUnique({
            where: { id },
            include: {
                offerTemplateImage: true,
                offerTemplatePage: {
                    include: {
                        offerTemplate: true,
                    },
                },
            },
        })) as Partial<OfferTemplatePageBlock> | null;

        return result ? new OfferTemplatePageBlock(result) : null;
    }

    async create(
        data: Partial<OfferTemplatePageBlock>,
    ): Promise<OfferTemplatePageBlock> {
        const result = (await this.prisma.offerTemplatePageBlock.create({
            data: {
                offer_template_page_id: data.offer_template_page_id!,
                order: data.order!,
                name: data.name!,
                code: data.code,
                type: data.type!,
                content: data.content,
                settings: data.settings,
                stickers: data.stickers,
                background: data.background,
                colors: data.colors,
                image_id: data.image_id,
            },
        })) as Partial<OfferTemplatePageBlock>;

        return new OfferTemplatePageBlock(result);
    }

    async createMany(
        data: Partial<CreateOfferTemplatePageBlockDto>[],
    ): Promise<OfferTemplatePageBlock[]> {

        console.log('data');
        console.log(data.map(d => ({
            ...d,
            offer_template_page_id: d.offer_template_page_id!,
            order: d.order!,
            name: d.name!,
            code: d.code,
            type: d.type!,
            content: d.content,
            settings: d.settings,
            stickers: d.stickers,
            background: d.background,
            colors: d.colors,
            image_id: d.image_id,
            created_at: new Date(),
            updated_at: new Date(),
        })));
        const results = (await this.prisma.offerTemplatePageBlock.createMany({
            data: data.map(d => {

                const block = {
                    ...d,
                    offer_template_page_id: d.offer_template_page_id!,
                    order: d.order!,
                    name: d.name!,
                    code: d.code,
                    type: d.type!,
                    content: d.content,
                    settings: d.settings,
                    stickers: d.stickers,
                    background: d.background,
                    colors: d.colors,
                    created_at: new Date(),
                    updated_at: new Date(),
                }
                if(d.image_id){
                    console.log('d.image_id');
                    console.log(d.image_id);
                    block.image_id = BigInt(d.image_id);
                }
                return block;
            }),
        })) as unknown as Partial<OfferTemplatePageBlock>[];

        return results.map(result => new OfferTemplatePageBlock(result)) as unknown as OfferTemplatePageBlock[];
    }

    async update(
        id: bigint,
        data: Partial<OfferTemplatePageBlock>,
    ): Promise<OfferTemplatePageBlock> {
        const result = (await this.prisma.offerTemplatePageBlock.update({
            where: { id },
            data: {
                ...(data.offer_template_page_id && {
                    offer_template_page_id: data.offer_template_page_id,
                }),
                ...(data.order !== undefined && { order: data.order }),
                ...(data.name && { name: data.name }),
                ...(data.code !== undefined && { code: data.code }),
                ...(data.type && { type: data.type }),
                ...(data.content !== undefined && { content: data.content }),
                ...(data.settings !== undefined && { settings: data.settings }),
                ...(data.stickers !== undefined && { stickers: data.stickers }),
                ...(data.background !== undefined && {
                    background: data.background,
                }),
                ...(data.colors !== undefined && { colors: data.colors }),
                ...(data.image_id !== undefined && { image_id: data.image_id }),
            },
        })) as Partial<OfferTemplatePageBlock>;

        return new OfferTemplatePageBlock(result);
    }

    async delete(id: bigint): Promise<void> {
        await this.prisma.offerTemplatePageBlock.delete({
            where: { id },
        });
    }

    async findByPage(page_id: bigint): Promise<OfferTemplatePageBlock[]> {
        const results = (await this.prisma.offerTemplatePageBlock.findMany({
            where: {
                offer_template_page_id: page_id,
            },
            include: {
                offerTemplateImage: true,
                offerTemplatePage: true,
            },
            orderBy: { order: 'asc' },
        })) as Partial<OfferTemplatePageBlock>[];

        return results.map(result => new OfferTemplatePageBlock(result));
    }

    async findByPageOrdered(
        page_id: bigint,
    ): Promise<OfferTemplatePageBlock[]> {
        const results = (await this.prisma.offerTemplatePageBlock.findMany({
            where: {
                offer_template_page_id: page_id,
            },
            include: {
                offerTemplateImage: true,
                offerTemplatePage: true,
            },
            orderBy: [{ order: 'asc' }, { created_at: 'asc' }],
        })) as Partial<OfferTemplatePageBlock>[];

        return results.map(result => new OfferTemplatePageBlock(result));
    }
}
