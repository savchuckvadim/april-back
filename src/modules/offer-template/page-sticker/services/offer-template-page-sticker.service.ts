import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { OfferTemplatePageStickerRepository } from '../repositories/offer-template-page-sticker.repository';
import { OfferTemplatePageSticker } from '../entities/offer-template-page-sticker.entity';
import { CreateOfferTemplatePageStickerDto } from '../dtos/create-offer-template-page-sticker.dto';
import { UpdateOfferTemplatePageStickerDto } from '../dtos/update-offer-template-page-sticker.dto';

@Injectable()
export class OfferTemplatePageStickerService {
    constructor(
        private readonly offerTemplatePageStickerRepository: OfferTemplatePageStickerRepository,
    ) { }

    async findById(id: bigint): Promise<OfferTemplatePageSticker> {
        const sticker =
            await this.offerTemplatePageStickerRepository.findById(id);
        if (!sticker) {
            throw new NotFoundException(
                `Offer template page sticker with ID ${id} not found`,
            );
        }
        return sticker;
    }

    async findMany(filters?: {
        offer_template_page_id?: bigint;
    }): Promise<OfferTemplatePageSticker[]> {
        return this.offerTemplatePageStickerRepository.findMany(filters);
    }

    async findWithRelations(id: bigint): Promise<OfferTemplatePageSticker> {
        const sticker =
            await this.offerTemplatePageStickerRepository.findWithRelations(id);
        if (!sticker) {
            throw new NotFoundException(
                `Offer template page sticker with ID ${id} not found`,
            );
        }
        return sticker;
    }

    async findByPage(page_id: bigint): Promise<OfferTemplatePageSticker[]> {
        return this.offerTemplatePageStickerRepository.findByPage(page_id);
    }

    async findByPageOrdered(
        page_id: bigint,
    ): Promise<OfferTemplatePageSticker[]> {
        return this.offerTemplatePageStickerRepository.findByPageOrdered(
            page_id,
        );
    }

    async create(
        createDto: CreateOfferTemplatePageStickerDto,
    ): Promise<OfferTemplatePageSticker> {
        // Check if sticker with same order already exists for this page
        const existingStickers =
            await this.offerTemplatePageStickerRepository.findMany({
                offer_template_page_id: BigInt(
                    createDto.offer_template_page_id,
                ),
            });

        const existingSticker = existingStickers.find(
            sticker => sticker.order === createDto.order,
        );
        if (existingSticker) {
            throw new BadRequestException(
                `Sticker with order ${createDto.order} already exists for this page`,
            );
        }

        const stickerData: Partial<OfferTemplatePageSticker> = {
            offer_template_page_id: BigInt(createDto.offer_template_page_id),
            order: createDto.order,
            name: createDto.name,
            code: createDto.code,
            size: createDto.size,
            height: createDto.height,
            width: createDto.width,
            position: createDto.position,
            style: createDto.style,
            settings: createDto.settings,
            background: createDto.background,
            colors: createDto.colors,
            image_id: createDto.image_id
                ? BigInt(createDto.image_id)
                : undefined,
        };

        return this.offerTemplatePageStickerRepository.create(stickerData);
    }

    async update(
        id: bigint,
        updateDto: UpdateOfferTemplatePageStickerDto,
    ): Promise<OfferTemplatePageSticker> {
        const existingSticker =
            await this.offerTemplatePageStickerRepository.findById(id);
        if (!existingSticker) {
            throw new NotFoundException(
                `Offer template page sticker with ID ${id} not found`,
            );
        }

        // Check if sticker with same order already exists for this page (excluding current sticker)
        if (
            updateDto.order !== undefined &&
            updateDto.order !== existingSticker.order
        ) {
            const existingStickers =
                await this.offerTemplatePageStickerRepository.findMany({
                    offer_template_page_id: updateDto.offer_template_page_id
                        ? BigInt(updateDto.offer_template_page_id)
                        : existingSticker.offer_template_page_id,
                });

            const existingWithOrder = existingStickers.find(
                sticker =>
                    sticker.order === updateDto.order && sticker.id !== id,
            );
            if (existingWithOrder) {
                throw new BadRequestException(
                    `Sticker with order ${updateDto.order} already exists for this page`,
                );
            }
        }

        const { offer_template_page_id, image_id, ...restDto } = updateDto;
        const stickerData: Partial<OfferTemplatePageSticker> = {
            ...restDto,
            ...(offer_template_page_id !== undefined && {
                offer_template_page_id: BigInt(offer_template_page_id),
            }),
            ...(image_id !== undefined && { image_id: BigInt(image_id) }),
        };

        return this.offerTemplatePageStickerRepository.update(id, stickerData);
    }

    async delete(id: bigint): Promise<void> {
        const existingSticker =
            await this.offerTemplatePageStickerRepository.findById(id);
        if (!existingSticker) {
            throw new NotFoundException(
                `Offer template page sticker with ID ${id} not found`,
            );
        }

        await this.offerTemplatePageStickerRepository.delete(id);
    }

    async reorderStickers(
        page_id: bigint,
        stickerOrders: { id: bigint; order: number }[],
    ): Promise<OfferTemplatePageSticker[]> {
        const updatedStickers: OfferTemplatePageSticker[] = [];

        for (const stickerOrder of stickerOrders) {
            const updatedSticker =
                await this.offerTemplatePageStickerRepository.update(
                    stickerOrder.id,
                    {
                        order: stickerOrder.order,
                    },
                );
            updatedStickers.push(updatedSticker);
        }

        return updatedStickers;
    }
}
