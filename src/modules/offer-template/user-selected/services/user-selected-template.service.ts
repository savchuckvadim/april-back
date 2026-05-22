import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { UserSelectedTemplateRepository } from '../repositories/user-selected-template.repository';
import { UserSelectedTemplate } from '../entities/user-selected-template.entity';
import { CreateUserSelectedTemplateDto } from '../dtos/create-user-selected-template.dto';
import { UpdateUserSelectedTemplateDto } from '../dtos/update-user-selected-template.dto';
import { UserSelectedTemplateFiltersType } from '../types/user-selected.type';
import { UserSelectedTemplateEntityDto } from '../dtos/user-selected-entity.dto';
import { OfferTemplateRepository } from '../../offer-template';

@Injectable()
export class UserSelectedTemplateService {
    constructor(
        private readonly offerTemplateRepository: OfferTemplateRepository,
        private readonly userSelectedTemplateRepository: UserSelectedTemplateRepository,
    ) {}

    async findById(id: bigint): Promise<UserSelectedTemplate> {
        const template = await this.userSelectedTemplateRepository.findById(id);
        if (!template) {
            throw new NotFoundException(
                `User selected template with ID ${id} not found`,
            );
        }
        return template;
    }

    async findMany(
        filters?: UserSelectedTemplateFiltersType,
    ): Promise<UserSelectedTemplate[]> {
        return await this.userSelectedTemplateRepository.findMany(filters);
    }

    async findWithRelations(id: bigint): Promise<UserSelectedTemplate> {
        const template =
            await this.userSelectedTemplateRepository.findWithRelations(id);
        if (!template) {
            throw new NotFoundException(
                `User selected template with ID ${id} not found`,
            );
        }
        return template;
    }

    async findByUser(
        user_id: bigint,
        portal_id: bigint,
    ): Promise<UserSelectedTemplate[]> {
        return this.userSelectedTemplateRepository.findByUser(
            user_id,
            portal_id,
        );
    }

    async findByUserAndTemplate(
        user_id: bigint,
        portal_id: bigint,
        template_id: bigint,
    ): Promise<UserSelectedTemplate | null> {
        return this.userSelectedTemplateRepository.findByUserAndTemplate(
            user_id,
            portal_id,
            template_id,
        );
    }

    // находит или создает связь шаблона  и пользователя из портала
    async findOrCreateByUserPortalAndTemplate(
        user_id: bigint,
        portal_id: bigint,
        template_id: bigint,
    ): Promise<UserSelectedTemplate> {
        let templateRelation: UserSelectedTemplate | null =
            await this.userSelectedTemplateRepository.findByUserAndTemplate(
                user_id,
                portal_id,
                template_id,
            );
        if (!templateRelation) {
            templateRelation = await this.create({
                bitrix_user_id: Number(user_id),
                portal_id: Number(portal_id),
                offer_template_id: Number(template_id),
            });
        }
        return templateRelation;
    }

    async findCurrentByUser(
        user_id: bigint,
        portal_id: bigint,
    ): Promise<UserSelectedTemplate | null> {
        return this.userSelectedTemplateRepository.findCurrentByUser(
            user_id,
            portal_id,
        );
    }

    async findFavoritesByUser(
        user_id: bigint,
        portal_id: bigint,
    ): Promise<UserSelectedTemplate[]> {
        return this.userSelectedTemplateRepository.findFavoritesByUser(
            user_id,
            portal_id,
        );
    }

    async create(
        createDto: CreateUserSelectedTemplateDto,
    ): Promise<UserSelectedTemplate> {
        // Check if user-template combination already exists
        const existingTemplate =
            await this.userSelectedTemplateRepository.findByUserAndTemplate(
                BigInt(createDto.bitrix_user_id),
                BigInt(createDto.portal_id),
                BigInt(createDto.offer_template_id),
            );

        if (existingTemplate) {
            throw new BadRequestException(
                `User already has this template selected`,
            );
        }

        // If setting as current, unset other current templates for this user
        if (createDto.is_current) {
            const currentTemplate =
                await this.userSelectedTemplateRepository.findCurrentByUser(
                    BigInt(createDto.bitrix_user_id),
                    BigInt(createDto.portal_id),
                );

            if (currentTemplate) {
                await this.userSelectedTemplateRepository.update(
                    BigInt(currentTemplate.id),
                    {
                        is_current: false,
                    },
                );
            }
        }

        const templateData: Partial<UserSelectedTemplate> = {
            bitrix_user_id: BigInt(createDto.bitrix_user_id),
            portal_id: BigInt(createDto.portal_id),
            offer_template_id: BigInt(createDto.offer_template_id),
            is_current: createDto.is_current || false,
            is_favorite: createDto.is_favorite || false,
            is_active: createDto.is_active || false,
            price_settings: createDto.price_settings,
            infoblock_settings: createDto.infoblock_settings,
            letter_text: createDto.letter_text,
            sale_text_1: createDto.sale_text_1,
            sale_text_2: createDto.sale_text_2,
            sale_text_3: createDto.sale_text_3,
            sale_text_4: createDto.sale_text_4,
            sale_text_5: createDto.sale_text_5,
        };

        return this.userSelectedTemplateRepository.create(templateData);
    }

    async update(
        id: bigint,
        updateDto: UpdateUserSelectedTemplateDto,
    ): Promise<UserSelectedTemplate> {
        const existingTemplate =
            await this.userSelectedTemplateRepository.findById(id);
        if (!existingTemplate) {
            throw new NotFoundException(
                `User selected template with ID ${id} not found`,
            );
        }

        // If setting as current, unset other current templates for this user
        if (updateDto.is_current) {
            const currentTemplate =
                await this.userSelectedTemplateRepository.findCurrentByUser(
                    updateDto.bitrix_user_id
                        ? BigInt(updateDto.bitrix_user_id)
                        : existingTemplate.bitrix_user_id,
                    updateDto.portal_id
                        ? BigInt(updateDto.portal_id)
                        : existingTemplate.portal_id,
                );

            if (currentTemplate && currentTemplate.id !== String(id)) {
                await this.userSelectedTemplateRepository.update(
                    BigInt(currentTemplate.id),
                    {
                        is_current: false,
                    },
                );
            }
        }

        const { bitrix_user_id, portal_id, offer_template_id, ...restDto } =
            updateDto;
        const templateData: Partial<UserSelectedTemplate> = {
            ...restDto,
            ...(bitrix_user_id !== undefined && {
                bitrix_user_id: BigInt(bitrix_user_id),
            }),
            ...(portal_id !== undefined && { portal_id: BigInt(portal_id) }),
            ...(offer_template_id !== undefined && {
                offer_template_id: BigInt(offer_template_id),
            }),
        };

        return this.userSelectedTemplateRepository.update(id, templateData);
    }

    async delete(id: bigint): Promise<void> {
        const existingTemplate =
            await this.userSelectedTemplateRepository.findById(id);
        if (!existingTemplate) {
            throw new NotFoundException(
                `User selected template with ID ${id} not found`,
            );
        }

        await this.userSelectedTemplateRepository.delete(id);
    }

    async setCurrentByPortalUserTemplate(
        dto: CreateUserSelectedTemplateDto,
    ): Promise<UserSelectedTemplate | boolean> {
        const { bitrix_user_id, portal_id, offer_template_id } = dto;
        const templateId = BigInt(offer_template_id);
        // находим шаблон по id
        const template =
            await this.offerTemplateRepository.findById(templateId);
        if (!template) {
            throw new NotFoundException(
                `Offer template with ID ${templateId} not found`,
            );
        }
        // находит или создает связь шаблона  и пользователя из портала
        //такая связь всегда одна шаблон-юзер
        const templateRelation: UserSelectedTemplate =
            await this.findOrCreateByUserPortalAndTemplate(
                BigInt(bitrix_user_id),
                BigInt(portal_id),
                BigInt(templateId),
            );

        // находим связь с флагом current юзер-current
        // возможно это та же связь,
        const currentRelationByCurrentFlag =
            await this.userSelectedTemplateRepository.findCurrentByUser(
                BigInt(bitrix_user_id),
                BigInt(portal_id),
            );

        if (currentRelationByCurrentFlag) {
            // есть связь с флагом current
            if (
                currentRelationByCurrentFlag.id !== String(templateRelation.id)
            ) {
                // если это другая связь, то нужно сбросить флаг current у этой связи и присвоить другой
                const isFavorite = currentRelationByCurrentFlag.is_favorite;
                if (!isFavorite) {
                    await this.userSelectedTemplateRepository.delete(
                        BigInt(currentRelationByCurrentFlag.id),
                    );
                } else {
                    await this.userSelectedTemplateRepository.update(
                        BigInt(currentRelationByCurrentFlag.id),
                        {
                            is_current: false,
                        },
                    );
                }
            } else {
                // это та же самая
            }
        }

        return this.setCurrent(BigInt(templateRelation.id));
    }

    async setCurrent(relationId: bigint): Promise<UserSelectedTemplate> {
        return this.userSelectedTemplateRepository.update(relationId, {
            is_current: true,
        });
    }

    async setFavoriteByPortalUserTemplate(
        dto: CreateUserSelectedTemplateDto,
        is_favorite: boolean,
    ): Promise<UserSelectedTemplateEntityDto | boolean> {
        const { bitrix_user_id, portal_id, offer_template_id } = dto;
        // находит или создает связь шаблона  и пользователя из портала
        const templateRelation: UserSelectedTemplate =
            await this.findOrCreateByUserPortalAndTemplate(
                BigInt(bitrix_user_id),
                BigInt(portal_id),
                BigInt(offer_template_id),
            );

        //избранных может быть много, но если сейчас признак избранности отжимается
        // и в текущей связи кроме этого не остается других флагов - is_current - false, то нужно удалить эту связь
        // устанавливает флаг favorite для связи шаблона  и пользователя из портала

        if (!is_favorite && !templateRelation.is_current) {
            await this.userSelectedTemplateRepository.delete(
                BigInt(templateRelation.id),
            );
            return true;
        }

        const updatedTemplate =
            await this.userSelectedTemplateRepository.update(
                BigInt(templateRelation.id),
                { is_favorite },
            );
        if (updatedTemplate) {
            return new UserSelectedTemplateEntityDto(updatedTemplate);
        }
        return true;
    }

    async setActiveByPortalUserTemplate(
        dto: CreateUserSelectedTemplateDto,
        is_active: boolean,
    ): Promise<UserSelectedTemplate> {
        const { bitrix_user_id, portal_id, offer_template_id } = dto;
        const templateRelation: UserSelectedTemplate =
            await this.findOrCreateByUserPortalAndTemplate(
                BigInt(bitrix_user_id),
                BigInt(portal_id),
                BigInt(offer_template_id),
            );

        const id = BigInt(templateRelation.id);
        return this.userSelectedTemplateRepository.update(id, { is_active });
    }
}
