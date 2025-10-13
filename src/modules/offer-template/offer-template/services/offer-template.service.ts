import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { OfferTemplateRepository } from '../repositories/offer-template.repository';
import {
    OfferTemplate,
    OfferTemplateSummary,
} from '../entities/offer-template.entity';

import { UpdateOfferTemplateDto } from '../dtos/update-offer-template.dto';
import { OfferTemplatePage } from '../../page/entities/offer-template-page.entity';
import { OfferTemplatePageRepository } from '../../page/repositories/offer-template-page.repository';
import { OfferTemplatePageBlockRepository } from '../../page-block/repositories/offer-template-page-block.repository';
import { CreateOfferTemplatePageBlockDto} from '../../page-block';
import { CreateOfferTemplateRequestDto } from '../dtos/create-offer-template.dto';

@Injectable()
export class OfferTemplateService {
    constructor(
        private readonly offerTemplateRepository: OfferTemplateRepository,
        private readonly offerTemplatePageRepository: OfferTemplatePageRepository,
        private readonly offerTemplatePageBlockRepository: OfferTemplatePageBlockRepository,
    ) { }

    async findById(id: bigint): Promise<OfferTemplate> {
        const template = await this.offerTemplateRepository.findById(id);
        if (!template) {
            throw new NotFoundException(
                `Offer template with ID ${id} not found`,
            );
        }
        return template;
    }

    async findByIdWithRelations(id: bigint): Promise<OfferTemplate> {
        const template =
            await this.offerTemplateRepository.findWithRelations(id);
        if (!template) {
            throw new NotFoundException(
                `Offer template with ID ${id} not found`,
            );
        }
        return template;
    }

    async findMany(filters?: {
        visibility?: 'public' | 'private' | 'user';
        portal_id?: bigint;
        is_active?: boolean;
        search?: string;
    }): Promise<OfferTemplateSummary[]> {

        console.log(filters);

        const result = await this.offerTemplateRepository.findMany(filters);
        console.log(result);

        
        return result;

    }

    async findPublic(): Promise<OfferTemplateSummary[]> {
        return this.offerTemplateRepository.findPublic();
    }

    async findByPortal(portal_id: bigint): Promise<OfferTemplateSummary[]> {
        return this.offerTemplateRepository.findByPortal(portal_id);
    }

    async findUserTemplates(
        user_id: bigint,
        portal_id: bigint,
    ): Promise<OfferTemplateSummary[]> {
        return this.offerTemplateRepository.findUserTemplates(
            user_id,
            portal_id,
        );
    }

    async create(createDto: CreateOfferTemplateRequestDto): Promise<OfferTemplate> {
        // Check if template with same code already exists
        // TODO: check if this is needed
        // TODO unique check for code

        // const existingTemplate = await this.offerTemplateRepository.findMany({
        //     search: createDto.code,
        // });

        // if (existingTemplate.length > 0) {
        //     throw new BadRequestException(
        //         `Template with code ${createDto.code} already exists`,
        //     );
        // }

        const templateData: Partial<OfferTemplate> = {
            name: createDto.name,
            visibility: createDto.visibility || 'private',
            is_default: createDto.is_default || false,
            file_path: createDto.file_path,
            demo_path: createDto.demo_path,
            type: createDto.type || 'single',
            rules: createDto.rules,
            price_settings: createDto.price_settings,
            infoblock_settings: createDto.infoblock_settings,
            letter_text: createDto.letter_text,
            sale_text_1: createDto.sale_text_1,
            sale_text_2: createDto.sale_text_2,
            sale_text_3: createDto.sale_text_3,
            sale_text_4: createDto.sale_text_4,
            sale_text_5: createDto.sale_text_5,
            field_codes: createDto.field_codes,
            style: createDto.style,
            color: createDto.color,
            code: createDto.code,
            tags: createDto.tags,
            is_active: createDto.is_active || false,
            counter: createDto.counter || 0,


        };
        const result = await this.offerTemplateRepository.create(templateData);

        if (!result || !result.id) {
            throw new BadRequestException(
                `Failed to create offer template`,
            );
        }

        for (const p of createDto.pages || []) {

            const page = await this.offerTemplatePageRepository.create(
                new OfferTemplatePage({
                    ...p,
                    offer_template_id: BigInt(result.id),
                    offerTemplate: result,

                })


            );

            const blocks: Partial<CreateOfferTemplatePageBlockDto>[] = p.blocks?.map(b => ({
                ...b,
                offer_template_page_id: BigInt(page.id),

            })) || [];

            if (!page || !page.id) {
                throw new BadRequestException(
                    `Failed to create offer template page`,
                );
            }

            blocks && await this.offerTemplatePageBlockRepository.createMany(blocks);
        }

        const resultWithRelations = await this.offerTemplateRepository.findById(BigInt(result.id));
        //@ts-ignore
        return resultWithRelations;
    }

    async update(
        id: bigint,
        updateDto: UpdateOfferTemplateDto,
    ): Promise<OfferTemplate> {
        const existingTemplate =
            await this.offerTemplateRepository.findById(id);
        if (!existingTemplate) {
            throw new NotFoundException(
                `Offer template with ID ${id} not found`,
            );
        }

        // Check if template with same code already exists (excluding current template)
        if (updateDto.code && updateDto.code !== existingTemplate.code) {
            const existingWithCode =
                await this.offerTemplateRepository.findMany({
                    search: updateDto.code,
                });

            if (existingWithCode.length > 0 && existingWithCode[0].id !== id) {
                throw new BadRequestException(
                    `Template with code ${updateDto.code} already exists`,
                );
            }
        }

        const templateData: Partial<OfferTemplate> = {
            ...updateDto,
        };

        return this.offerTemplateRepository.update(id, templateData);
    }

    async delete(id: bigint): Promise<void> {
        const existingTemplate =
            await this.offerTemplateRepository.findById(id);
        if (!existingTemplate) {
            throw new NotFoundException(
                `Offer template with ID ${id} not found`,
            );
        }

        await this.offerTemplateRepository.delete(id);
    }

    async incrementCounter(id: bigint): Promise<OfferTemplate> {
        const template = await this.findById(id);
        const updatedTemplate = await this.offerTemplateRepository.update(id, {
            counter: template.counter + 1,
        });
        return updatedTemplate;
    }

    async setActive(id: bigint, is_active: boolean): Promise<OfferTemplate> {
        const template = await this.findById(id);
        return this.offerTemplateRepository.update(id, { is_active });
    }

    async setDefault(id: bigint, is_default: boolean): Promise<OfferTemplate> {
        const template = await this.findById(id);

        // If setting as default, unset other defaults
        if (is_default) {
            const otherTemplates = await this.offerTemplateRepository.findMany({
                visibility: template.visibility,
            });

            for (const otherTemplate of otherTemplates) {
                if (otherTemplate.id !== id) {
                    await this.offerTemplateRepository.update(
                        BigInt(otherTemplate.id),
                        {
                            is_default: false,
                        },
                    );
                }
            }
        }

        return this.offerTemplateRepository.update(id, { is_default });
    }
}
