import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { OfferTemplateFontRepository } from '../repositories/offer-template-font.repository';
import { OfferTemplateFont } from '../entities/offer-template-font.entity';
import { CreateOfferTemplateFontDto } from '../dtos/create-offer-template-font.dto';
import { UpdateOfferTemplateFontDto } from '../dtos/update-offer-template-font.dto';

@Injectable()
export class OfferTemplateFontService {
    constructor(
        private readonly offerTemplateFontRepository: OfferTemplateFontRepository,
    ) {}

    async findById(id: bigint): Promise<OfferTemplateFont> {
        const font = await this.offerTemplateFontRepository.findById(id);
        if (!font) {
            throw new NotFoundException(
                `Offer template font with ID ${id} not found`,
            );
        }
        return font;
    }

    async findMany(filters?: {
        offer_template_id?: bigint;
    }): Promise<OfferTemplateFont[]> {
        return this.offerTemplateFontRepository.findMany(filters);
    }

    async findWithRelations(id: bigint): Promise<OfferTemplateFont> {
        const font =
            await this.offerTemplateFontRepository.findWithRelations(id);
        if (!font) {
            throw new NotFoundException(
                `Offer template font with ID ${id} not found`,
            );
        }
        return font;
    }

    async findByTemplate(template_id: bigint): Promise<OfferTemplateFont[]> {
        return this.offerTemplateFontRepository.findByTemplate(template_id);
    }

    async create(
        createDto: CreateOfferTemplateFontDto,
    ): Promise<OfferTemplateFont> {
        // Check if font with same code already exists for this template
        const existingFonts = await this.offerTemplateFontRepository.findMany({
            offer_template_id: BigInt(createDto.offer_template_id),
        });

        const existingFont = existingFonts.find(
            font => font.code === createDto.code,
        );
        if (existingFont) {
            throw new BadRequestException(
                `Font with code ${createDto.code} already exists for this template`,
            );
        }

        const fontData: Partial<OfferTemplateFont> = {
            offer_template_id: BigInt(createDto.offer_template_id),
            name: createDto.name,
            code: createDto.code,
            data: createDto.data,
            items: createDto.items,
            current: createDto.current,
            settings: createDto.settings,
        };

        return this.offerTemplateFontRepository.create(fontData);
    }

    async update(
        id: bigint,
        updateDto: UpdateOfferTemplateFontDto,
    ): Promise<OfferTemplateFont> {
        const existingFont =
            await this.offerTemplateFontRepository.findById(id);
        if (!existingFont) {
            throw new NotFoundException(
                `Offer template font with ID ${id} not found`,
            );
        }

        // Check if font with same code already exists for this template (excluding current font)
        if (updateDto.code && updateDto.code !== existingFont.code) {
            const existingFonts =
                await this.offerTemplateFontRepository.findMany({
                    offer_template_id: updateDto.offer_template_id
                        ? BigInt(updateDto.offer_template_id)
                        : existingFont.offer_template_id,
                });

            const existingWithCode = existingFonts.find(
                font => font.code === updateDto.code && font.id !== id,
            );
            if (existingWithCode) {
                throw new BadRequestException(
                    `Font with code ${updateDto.code} already exists for this template`,
                );
            }
        }

        const { offer_template_id, ...restDto } = updateDto;
        const fontData: Partial<OfferTemplateFont> = {
            ...restDto,
            ...(offer_template_id !== undefined && {
                offer_template_id: BigInt(offer_template_id),
            }),
        };

        return this.offerTemplateFontRepository.update(id, fontData);
    }

    async delete(id: bigint): Promise<void> {
        const existingFont =
            await this.offerTemplateFontRepository.findById(id);
        if (!existingFont) {
            throw new NotFoundException(
                `Offer template font with ID ${id} not found`,
            );
        }

        await this.offerTemplateFontRepository.delete(id);
    }
}
