import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { OfferTemplatePageRepository } from '../repositories/offer-template-page.repository';
import { OfferTemplatePage } from '../entities/offer-template-page.entity';

import { UpdateOfferTemplatePageRequestDto } from '../dtos/update-offer-template-page.dto';
import { CreateOfferTemplatePageRequestDto } from '../dtos/create-offer-template-page.dto';

@Injectable()
export class OfferTemplatePageService {
    constructor(
        private readonly offerTemplatePageRepository: OfferTemplatePageRepository,
    ) {}

    async findById(id: bigint): Promise<OfferTemplatePage> {
        const page = await this.offerTemplatePageRepository.findById(id);
        if (!page) {
            throw new NotFoundException(
                `Offer template page with ID ${id} not found`,
            );
        }
        return page;
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
        return this.offerTemplatePageRepository.findMany(filters);
    }

    async findWithRelations(id: bigint): Promise<OfferTemplatePage> {
        const page =
            await this.offerTemplatePageRepository.findWithRelations(id);
        if (!page) {
            throw new NotFoundException(
                `Offer template page with ID ${id} not found`,
            );
        }
        return page;
    }

    async findByTemplate(template_id: bigint): Promise<OfferTemplatePage[]> {
        return this.offerTemplatePageRepository.findByTemplate(template_id);
    }

    async findByTemplateWithBlocks(
        template_id: bigint,
    ): Promise<OfferTemplatePage[]> {
        return this.offerTemplatePageRepository.findByTemplateWithBlocks(
            template_id,
        );
    }

    async create(
        createDto: CreateOfferTemplatePageRequestDto,
    ): Promise<OfferTemplatePage> {
        // Check if page with same order already exists for this template
        const existingPages = await this.offerTemplatePageRepository.findMany({
            offer_template_id: BigInt(createDto.offer_template_id),
        });

        const existingPage = existingPages.find(
            page => page.order === createDto.order,
        );
        if (existingPage) {
            throw new BadRequestException(
                `Page with order ${createDto.order} already exists for this template`,
            );
        }

        const pageData: Partial<OfferTemplatePage> = {
            offer_template_id: BigInt(createDto.offer_template_id),
            order: createDto.order,
            name: createDto.name,
            code: createDto.code,
            type: createDto.type || 'default',
            is_active:
                createDto.is_active !== undefined ? createDto.is_active : true,
            settings: createDto.settings,
            stickers: createDto.stickers,
            background: createDto.background,
            colors: createDto.colors,
            fonts: createDto.fonts,
        };

        return this.offerTemplatePageRepository.create(pageData);
    }

    async update(
        id: bigint,
        updateDto: UpdateOfferTemplatePageRequestDto,
    ): Promise<OfferTemplatePage> {
        const existingPage =
            await this.offerTemplatePageRepository.findById(id);
        if (!existingPage) {
            throw new NotFoundException(
                `Offer template page with ID ${id} not found`,
            );
        }

        // Check if page with same order already exists for this template (excluding current page)
        if (
            updateDto.order !== undefined &&
            updateDto.order !== existingPage.order
        ) {
            const existingPages =
                await this.offerTemplatePageRepository.findMany({
                    offer_template_id: updateDto.offer_template_id
                        ? BigInt(updateDto.offer_template_id)
                        : existingPage.offer_template_id,
                });

            const existingWithOrder = existingPages.find(
                page => page.order === updateDto.order && page.id !== id,
            );
            if (existingWithOrder) {
                throw new BadRequestException(
                    `Page with order ${updateDto.order} already exists for this template`,
                );
            }
        }

        const { offer_template_id, ...restDto } = updateDto;
        const pageData: Partial<OfferTemplatePage> = {
            ...restDto,
            ...(offer_template_id !== undefined && {
                offer_template_id: BigInt(offer_template_id),
            }),
        };

        return this.offerTemplatePageRepository.update(id, pageData);
    }

    async delete(id: bigint): Promise<void> {
        const existingPage =
            await this.offerTemplatePageRepository.findById(id);
        if (!existingPage) {
            throw new NotFoundException(
                `Offer template page with ID ${id} not found`,
            );
        }

        await this.offerTemplatePageRepository.delete(id);
    }

    async setActive(
        id: bigint,
        is_active: boolean,
    ): Promise<OfferTemplatePage> {
        const page = await this.findById(id);
        return this.offerTemplatePageRepository.update(id, { is_active });
    }

    async reorderPages(
        template_id: bigint,
        pageOrders: { id: bigint; order: number }[],
    ): Promise<OfferTemplatePage[]> {
        const updatedPages: OfferTemplatePage[] = [];

        for (const pageOrder of pageOrders) {
            const updatedPage = await this.offerTemplatePageRepository.update(
                pageOrder.id,
                { order: pageOrder.order },
            );
            updatedPages.push(updatedPage);
        }

        return updatedPages;
    }
}
