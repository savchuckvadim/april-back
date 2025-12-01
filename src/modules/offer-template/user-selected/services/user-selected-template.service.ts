import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { UserSelectedTemplateRepository } from '../repositories/user-selected-template.repository';
import { UserSelectedTemplate } from '../entities/user-selected-template.entity';
import { CreateUserSelectedTemplateDto } from '../dtos/create-user-selected-template.dto';
import { UpdateUserSelectedTemplateDto } from '../dtos/update-user-selected-template.dto';

@Injectable()
export class UserSelectedTemplateService {
    constructor(
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

    async findMany(filters?: {
        bitrix_user_id?: bigint;
        portal_id?: bigint;
        offer_template_id?: bigint;
        is_current?: boolean;
        is_favorite?: boolean;
        is_active?: boolean;
    }): Promise<UserSelectedTemplate[]> {
        return this.userSelectedTemplateRepository.findMany(filters);
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

    async setCurrent(id: bigint): Promise<UserSelectedTemplate> {
        const template = await this.findById(id);

        // Unset other current templates for this user
        const currentTemplate =
            await this.userSelectedTemplateRepository.findCurrentByUser(
                template.bitrix_user_id,
                template.portal_id,
            );

        if (currentTemplate && currentTemplate.id !== String(id)) {
            await this.userSelectedTemplateRepository.update(
                BigInt(currentTemplate.id),
                {
                    is_current: false,
                },
            );
        }

        return this.userSelectedTemplateRepository.update(id, {
            is_current: true,
        });
    }

    async setFavorite(
        id: bigint,
        is_favorite: boolean,
    ): Promise<UserSelectedTemplate> {
        const template = await this.findById(id);
        return this.userSelectedTemplateRepository.update(id, { is_favorite });
    }

    async setActive(
        id: bigint,
        is_active: boolean,
    ): Promise<UserSelectedTemplate> {
        const template = await this.findById(id);
        return this.userSelectedTemplateRepository.update(id, { is_active });
    }
}
