import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { OfferTemplateImageRepository } from '../repositories/offer-template-image.repository';
import { OfferTemplateImage } from '../entities/offer-template-image.entity';
import { CreateOfferTemplateImageDto } from '../dtos/create-offer-template-image.dto';
import { UpdateOfferTemplateImageDto } from '../dtos/update-offer-template-image.dto';

@Injectable()
export class OfferTemplateImageService {
    constructor(
        private readonly offerTemplateImageRepository: OfferTemplateImageRepository,
    ) {}

    async findById(id: bigint): Promise<OfferTemplateImage> {
        const image = await this.offerTemplateImageRepository.findById(id);
        if (!image) {
            throw new NotFoundException(
                `Offer template image with ID ${id} not found`,
            );
        }
        return image;
    }

    async findMany(filters?: {
        portal_id?: bigint;
        storage_type?: 'app' | 'public' | 'private';
        parent?: 'template' | 'page' | 'block' | 'sticker' | 'other';
        is_public?: boolean;
    }): Promise<OfferTemplateImage[]> {
        return this.offerTemplateImageRepository.findMany(filters);
    }

    async findWithRelations(id: bigint): Promise<OfferTemplateImage> {
        const image =
            await this.offerTemplateImageRepository.findWithRelations(id);
        if (!image) {
            throw new NotFoundException(
                `Offer template image with ID ${id} not found`,
            );
        }
        return image;
    }

    async findByPortal(portal_id: bigint): Promise<OfferTemplateImage[]> {
        return this.offerTemplateImageRepository.findByPortal(portal_id);
    }

    async findByParent(
        parent: 'template' | 'page' | 'block' | 'sticker' | 'other',
    ): Promise<OfferTemplateImage[]> {
        return this.offerTemplateImageRepository.findByParent(parent);
    }

    async create(
        createDto: CreateOfferTemplateImageDto,
    ): Promise<OfferTemplateImage> {
        const imageData: Partial<OfferTemplateImage> = {
            path: createDto.path,
            storage_type: createDto.storage_type || 'public',
            original_name: createDto.original_name,
            mime: createDto.mime,
            size: createDto.size,
            height: createDto.height,
            width: createDto.width,
            position: createDto.position,
            style: createDto.style,
            settings: createDto.settings,
            is_public: createDto.is_public || false,
            parent: createDto.parent || 'other',
            bitrix_user_id: createDto.bitrix_user_id,
            domain: createDto.domain,
            portal_id: createDto.portal_id
                ? BigInt(createDto.portal_id)
                : undefined,
        };

        return this.offerTemplateImageRepository.create(imageData);
    }

    async update(
        id: bigint,
        updateDto: UpdateOfferTemplateImageDto,
    ): Promise<OfferTemplateImage> {
        const existingImage =
            await this.offerTemplateImageRepository.findById(id);
        if (!existingImage) {
            throw new NotFoundException(
                `Offer template image with ID ${id} not found`,
            );
        }

        const { portal_id, ...restDto } = updateDto;
        const imageData: Partial<OfferTemplateImage> = {
            ...restDto,
            ...(portal_id !== undefined && { portal_id: BigInt(portal_id) }),
        };

        return this.offerTemplateImageRepository.update(id, imageData);
    }

    async delete(id: bigint): Promise<void> {
        const existingImage =
            await this.offerTemplateImageRepository.findById(id);
        if (!existingImage) {
            throw new NotFoundException(
                `Offer template image with ID ${id} not found`,
            );
        }

        await this.offerTemplateImageRepository.delete(id);
    }

    async setPublic(
        id: bigint,
        is_public: boolean,
    ): Promise<OfferTemplateImage> {
        const image = await this.findById(id);
        return this.offerTemplateImageRepository.update(id, { is_public });
    }

    async findByStorageType(
        storage_type: 'app' | 'public' | 'private',
    ): Promise<OfferTemplateImage[]> {
        return this.offerTemplateImageRepository.findMany({ storage_type });
    }
}
