import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { OfferTemplatePageBlockRepository } from '../repositories/offer-template-page-block.repository';
import { OfferTemplatePageBlock } from '../entities/offer-template-page-block.entity';
import { CreateOfferTemplatePageBlockDto } from '../dtos/create-offer-template-page-block.dto';
import { UpdateOfferTemplatePageBlockDto } from '../dtos/update-offer-template-page-block.dto';

@Injectable()
export class OfferTemplatePageBlockService {
    constructor(
        private readonly offerTemplatePageBlockRepository: OfferTemplatePageBlockRepository,
    ) {}

    async findById(id: bigint): Promise<OfferTemplatePageBlock> {
        const block = await this.offerTemplatePageBlockRepository.findById(id);
        if (!block) {
            throw new NotFoundException(
                `Offer template page block with ID ${id} not found`,
            );
        }
        return block;
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
        return this.offerTemplatePageBlockRepository.findMany(filters);
    }

    async findWithRelations(id: bigint): Promise<OfferTemplatePageBlock> {
        const block =
            await this.offerTemplatePageBlockRepository.findWithRelations(id);
        if (!block) {
            throw new NotFoundException(
                `Offer template page block with ID ${id} not found`,
            );
        }
        return block;
    }

    async findByPage(page_id: bigint): Promise<OfferTemplatePageBlock[]> {
        return this.offerTemplatePageBlockRepository.findByPage(page_id);
    }

    async findByPageOrdered(
        page_id: bigint,
    ): Promise<OfferTemplatePageBlock[]> {
        return this.offerTemplatePageBlockRepository.findByPageOrdered(page_id);
    }

    async create(
        createDto: CreateOfferTemplatePageBlockDto,
    ): Promise<OfferTemplatePageBlock> {
        // Check if block with same order already exists for this page
        const existingBlocks =
            await this.offerTemplatePageBlockRepository.findMany({
                offer_template_page_id: BigInt(
                    createDto.offer_template_page_id,
                ),
            });

        const existingBlock = existingBlocks.find(
            block => block.order === createDto.order,
        );
        if (existingBlock) {
            throw new BadRequestException(
                `Block with order ${createDto.order} already exists for this page`,
            );
        }

        const blockData: Partial<OfferTemplatePageBlock> = {
            offer_template_page_id: BigInt(createDto.offer_template_page_id),
            order: createDto.order,
            name: createDto.name,
            code: createDto.code,
            type: createDto.type || 'default',
            content: createDto.content,
            settings: createDto.settings,
            stickers: createDto.stickers,
            background: createDto.background,
            colors: createDto.colors,
            image_id: createDto.image_id
                ? BigInt(createDto.image_id)
                : undefined,
        };

        return this.offerTemplatePageBlockRepository.create(blockData);
    }

    async update(
        id: bigint,
        updateDto: UpdateOfferTemplatePageBlockDto,
    ): Promise<OfferTemplatePageBlock> {
        const existingBlock =
            await this.offerTemplatePageBlockRepository.findById(id);
        if (!existingBlock) {
            throw new NotFoundException(
                `Offer template page block with ID ${id} not found`,
            );
        }

        // Check if block with same order already exists for this page (excluding current block)
        if (
            updateDto.order !== undefined &&
            updateDto.order !== existingBlock.order
        ) {
            const existingBlocks =
                await this.offerTemplatePageBlockRepository.findMany({
                    offer_template_page_id: updateDto.offer_template_page_id
                        ? BigInt(updateDto.offer_template_page_id)
                        : existingBlock.offer_template_page_id,
                });

            const existingWithOrder = existingBlocks.find(
                block => block.order === updateDto.order && block.id !== id,
            );
            if (existingWithOrder) {
                throw new BadRequestException(
                    `Block with order ${updateDto.order} already exists for this page`,
                );
            }
        }

        const { offer_template_page_id, image_id, ...restDto } = updateDto;
        const blockData: Partial<OfferTemplatePageBlock> = {
            ...restDto,
            ...(offer_template_page_id !== undefined && {
                offer_template_page_id: BigInt(offer_template_page_id),
            }),
            ...(image_id !== undefined && { image_id: BigInt(image_id) }),
        };

        return this.offerTemplatePageBlockRepository.update(id, blockData);
    }

    async delete(id: bigint): Promise<void> {
        const existingBlock =
            await this.offerTemplatePageBlockRepository.findById(id);
        if (!existingBlock) {
            throw new NotFoundException(
                `Offer template page block with ID ${id} not found`,
            );
        }

        await this.offerTemplatePageBlockRepository.delete(id);
    }

    async reorderBlocks(
        page_id: bigint,
        blockOrders: { id: bigint; order: number }[],
    ): Promise<OfferTemplatePageBlock[]> {
        const updatedBlocks: OfferTemplatePageBlock[] = [];

        for (const blockOrder of blockOrders) {
            const updatedBlock =
                await this.offerTemplatePageBlockRepository.update(
                    blockOrder.id,
                    { order: blockOrder.order },
                );
            updatedBlocks.push(updatedBlock);
        }

        return updatedBlocks;
    }

    async findByType(
        type:
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
            | 'default',
    ): Promise<OfferTemplatePageBlock[]> {
        return this.offerTemplatePageBlockRepository.findMany({ type });
    }
}
