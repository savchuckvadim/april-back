import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { OfferTemplatePortalRepository } from '../repositories/offer-template-portal.repository';
import { OfferTemplatePortal } from '../entities/offer-template-portal.entity';
import { CreateOfferTemplatePortalDto } from '../dtos/create-offer-template-portal.dto';
import { UpdateOfferTemplatePortalDto } from '../dtos/update-offer-template-portal.dto';

@Injectable()
export class OfferTemplatePortalService {
    constructor(
        private readonly offerTemplatePortalRepository: OfferTemplatePortalRepository,
    ) {}

    async findById(id: bigint): Promise<OfferTemplatePortal> {
        const portal = await this.offerTemplatePortalRepository.findById(id);
        if (!portal) {
            throw new NotFoundException(
                `Offer template portal with ID ${id} not found`,
            );
        }
        return portal;
    }

    async findMany(filters?: {
        offer_template_id?: bigint;
        portal_id?: bigint;
        is_active?: boolean;
        is_default?: boolean;
    }): Promise<OfferTemplatePortal[]> {
        return this.offerTemplatePortalRepository.findMany(filters);
    }

    async findWithRelations(id: bigint): Promise<OfferTemplatePortal> {
        const portal =
            await this.offerTemplatePortalRepository.findWithRelations(id);
        if (!portal) {
            throw new NotFoundException(
                `Offer template portal with ID ${id} not found`,
            );
        }
        return portal;
    }

    async findByPortal(portal_id: bigint): Promise<OfferTemplatePortal[]> {
        return this.offerTemplatePortalRepository.findByPortal(portal_id);
    }

    async findByTemplate(template_id: bigint): Promise<OfferTemplatePortal[]> {
        return this.offerTemplatePortalRepository.findByTemplate(template_id);
    }

    async findActiveByPortal(
        portal_id: bigint,
    ): Promise<OfferTemplatePortal[]> {
        return this.offerTemplatePortalRepository.findActiveByPortal(portal_id);
    }

    async create(
        createDto: CreateOfferTemplatePortalDto,
    ): Promise<OfferTemplatePortal> {
        // Check if template-portal combination already exists
        const existingPortals =
            await this.offerTemplatePortalRepository.findMany({
                offer_template_id: BigInt(createDto.offer_template_id),
                portal_id: BigInt(createDto.portal_id),
            });

        if (existingPortals.length > 0) {
            throw new BadRequestException(
                `Template-portal combination already exists`,
            );
        }

        const portalData: Partial<OfferTemplatePortal> = {
            offer_template_id: BigInt(createDto.offer_template_id),
            portal_id: BigInt(createDto.portal_id),
            is_default: createDto.is_default || false,
            is_active: createDto.is_active || false,
        };

        return this.offerTemplatePortalRepository.create(portalData);
    }

    async update(
        id: bigint,
        updateDto: UpdateOfferTemplatePortalDto,
    ): Promise<OfferTemplatePortal> {
        const existingPortal =
            await this.offerTemplatePortalRepository.findById(id);
        if (!existingPortal) {
            throw new NotFoundException(
                `Offer template portal with ID ${id} not found`,
            );
        }

        // Check if template-portal combination already exists (excluding current portal)
        if (updateDto.offer_template_id && updateDto.portal_id) {
            const existingPortals =
                await this.offerTemplatePortalRepository.findMany({
                    offer_template_id: BigInt(updateDto.offer_template_id),
                    portal_id: BigInt(updateDto.portal_id),
                });

            const existingWithCombination = existingPortals.find(
                portal => portal.id !== id,
            );
            if (existingWithCombination) {
                throw new BadRequestException(
                    `Template-portal combination already exists`,
                );
            }
        }

        const { offer_template_id, portal_id, ...restDto } = updateDto;
        const portalData: Partial<OfferTemplatePortal> = {
            ...restDto,
            ...(offer_template_id !== undefined && {
                offer_template_id: BigInt(offer_template_id),
            }),
            ...(portal_id !== undefined && { portal_id: BigInt(portal_id) }),
        };

        return this.offerTemplatePortalRepository.update(id, portalData);
    }

    async delete(id: bigint): Promise<void> {
        const existingPortal =
            await this.offerTemplatePortalRepository.findById(id);
        if (!existingPortal) {
            throw new NotFoundException(
                `Offer template portal with ID ${id} not found`,
            );
        }

        await this.offerTemplatePortalRepository.delete(id);
    }

    async setActive(
        id: bigint,
        is_active: boolean,
    ): Promise<OfferTemplatePortal> {
        const portal = await this.findById(id);
        return this.offerTemplatePortalRepository.update(id, { is_active });
    }

    async setDefault(
        id: bigint,
        is_default: boolean,
    ): Promise<OfferTemplatePortal> {
        const portal = await this.findById(id);

        // If setting as default, unset other defaults for the same portal
        if (is_default) {
            const otherPortals =
                await this.offerTemplatePortalRepository.findMany({
                    portal_id: portal.portal_id,
                });

            for (const otherPortal of otherPortals) {
                if (otherPortal.id !== id) {
                    await this.offerTemplatePortalRepository.update(
                        otherPortal.id,
                        {
                            is_default: false,
                        },
                    );
                }
            }
        }

        return this.offerTemplatePortalRepository.update(id, { is_default });
    }
}
