import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { UserSelectedTemplateRepository } from '../repositories/user-selected-template.repository';
import { UserSelectedTemplate } from '../entities/user-selected-template.entity';
import { UserSelectedTemplateFiltersType } from '../types/user-selected.type';
import { Prisma } from 'generated/prisma';

type UserSelectedWithOfferTemplate = Prisma.UserSelectedTemplateGetPayload<{
    include: { offerTemplate: true };
}>;

@Injectable()
export class UserSelectedTemplatePrismaRepository
    implements UserSelectedTemplateRepository
{
    constructor(private readonly prisma: PrismaService) {}

    async findById(id: bigint): Promise<UserSelectedTemplate | null> {
        const result = await this.prisma.userSelectedTemplate.findUnique({
            where: { id },
            include: {
                offerTemplate: true,
            },
        });
        if (!result) return null;
        const entity = {
            ...result,
            id: String(result.id),
            offerTemplate: result.offerTemplate
                ? {
                      ...result.offerTemplate,
                      id: String(result.offerTemplate.id),
                  }
                : undefined,
        } as Partial<UserSelectedTemplate>;

        return new UserSelectedTemplate(entity);
    }

    async findMany(
        filters?: UserSelectedTemplateFiltersType,
    ): Promise<UserSelectedTemplate[]> {
        const where: Prisma.UserSelectedTemplateWhereInput = {};
        const f: UserSelectedTemplateFiltersType | undefined = filters;

        if (f?.bitrix_user_id !== undefined) {
            where.bitrix_user_id = f.bitrix_user_id;
        }

        if (f?.portal_id !== undefined) {
            where.portal_id = f.portal_id;
        }

        if (f?.offer_template_id !== undefined) {
            where.offer_template_id = f.offer_template_id;
        }

        if (f?.is_current !== undefined) {
            where.is_current = f.is_current;
        }

        if (f?.is_favorite !== undefined) {
            where.is_favorite = f.is_favorite;
        }

        if (f?.is_active !== undefined) {
            where.is_active = f.is_active;
        }

        const results = (await this.prisma.userSelectedTemplate.findMany({
            where,
            include: {
                offerTemplate: true,
            },
            orderBy: { created_at: 'desc' },
        })) as UserSelectedWithOfferTemplate[];
        const entities = results.map(
            result =>
                ({
                    ...result,
                    id: String(result.id),
                    offerTemplate: result.offerTemplate
                        ? {
                              ...result.offerTemplate,
                              id: String(result.offerTemplate.id),
                          }
                        : undefined,
                }) as Partial<UserSelectedTemplate>,
        );

        return entities.map(entity => new UserSelectedTemplate(entity));
    }

    async findWithRelations(id: bigint): Promise<UserSelectedTemplate | null> {
        const result = await this.prisma.userSelectedTemplate.findUnique({
            where: { id },
            include: {
                offerTemplate: {
                    include: {
                        offerTemplateFonts: true,
                        offerTemplatePages: {
                            include: {
                                offerTemplatePageBlocks: {
                                    include: {
                                        offerTemplateImage: true,
                                    },
                                },
                                offerTemplatePageStickers: {
                                    include: {
                                        offerTemplateImages: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!result) return null;
        const entity = {
            ...result,
            id: String(result.id),
            offerTemplate: result.offerTemplate
                ? {
                      ...result.offerTemplate,
                      id: String(result.offerTemplate.id),
                  }
                : undefined,
        } as Partial<UserSelectedTemplate>;

        return new UserSelectedTemplate(entity);
    }

    async create(
        data: Partial<UserSelectedTemplate>,
    ): Promise<UserSelectedTemplate> {
        const result = await this.prisma.userSelectedTemplate.create({
            data: {
                bitrix_user_id: data.bitrix_user_id!,
                portal_id: data.portal_id!,
                offer_template_id: data.offer_template_id!,
                is_current: data.is_current!,
                is_favorite: data.is_favorite!,
                is_active: data.is_active!,
                price_settings: data.price_settings,
                infoblock_settings: data.infoblock_settings,
                letter_text: data.letter_text,
                sale_text_1: data.sale_text_1,
                sale_text_2: data.sale_text_2,
                sale_text_3: data.sale_text_3,
                sale_text_4: data.sale_text_4,
                sale_text_5: data.sale_text_5,
            },
        });
        const entity = {
            ...result,
            id: String(result.id),
        } as Partial<UserSelectedTemplate>;
        return new UserSelectedTemplate(entity);
    }

    async update(
        id: bigint,
        data: Partial<UserSelectedTemplate>,
    ): Promise<UserSelectedTemplate> {
        console.log(id, 'id');
        console.log(data, 'data');
        const check = await this.prisma.userSelectedTemplate.findUnique({
            where: { id },
        });
        console.log(check, 'check');
        if (!check) {
            throw new NotFoundException(
                `User selected template with ID ${id} not found`,
            );
        }
        const result = await this.prisma.userSelectedTemplate.update({
            where: { id },
            data: {
                ...(data.bitrix_user_id && {
                    bitrix_user_id: data.bitrix_user_id,
                }),
                ...(data.portal_id && { portal_id: data.portal_id }),
                ...(data.offer_template_id && {
                    offer_template_id: data.offer_template_id,
                }),
                ...(data.is_current !== undefined && {
                    is_current: data.is_current,
                }),
                ...(data.is_favorite !== undefined && {
                    is_favorite: data.is_favorite,
                }),
                ...(data.is_active !== undefined && {
                    is_active: data.is_active,
                }),
                ...(data.price_settings !== undefined && {
                    price_settings: data.price_settings,
                }),
                ...(data.infoblock_settings !== undefined && {
                    infoblock_settings: data.infoblock_settings,
                }),
                ...(data.letter_text !== undefined && {
                    letter_text: data.letter_text,
                }),
                ...(data.sale_text_1 !== undefined && {
                    sale_text_1: data.sale_text_1,
                }),
                ...(data.sale_text_2 !== undefined && {
                    sale_text_2: data.sale_text_2,
                }),
                ...(data.sale_text_3 !== undefined && {
                    sale_text_3: data.sale_text_3,
                }),
                ...(data.sale_text_4 !== undefined && {
                    sale_text_4: data.sale_text_4,
                }),
                ...(data.sale_text_5 !== undefined && {
                    sale_text_5: data.sale_text_5,
                }),
            },
        });
        console.log(result, 'result');
        const entity = {
            ...result,
            id: String(result.id),
        } as Partial<UserSelectedTemplate>;
        console.log(entity, 'entity');
        return new UserSelectedTemplate(entity);
    }

    async delete(id: bigint): Promise<void> {
        await this.prisma.userSelectedTemplate.delete({
            where: { id },
        });
    }

    async findByUser(
        user_id: bigint,
        portal_id: bigint,
    ): Promise<UserSelectedTemplate[]> {
        const results = (await this.prisma.userSelectedTemplate.findMany({
            where: {
                bitrix_user_id: user_id,
                portal_id,
            },
            include: {
                offerTemplate: true,
            },
            orderBy: { created_at: 'desc' },
        })) as UserSelectedWithOfferTemplate[];
        const entities = results.map(
            result =>
                ({
                    ...result,
                    id: String(result.id),
                    offerTemplate: result.offerTemplate
                        ? {
                              ...result.offerTemplate,
                              id: String(result.offerTemplate.id),
                          }
                        : undefined,
                }) as Partial<UserSelectedTemplate>,
        );
        return entities.map(entity => new UserSelectedTemplate(entity));
    }

    async findByUserAndTemplate(
        user_id: bigint,
        portal_id: bigint,
        template_id: bigint,
    ): Promise<UserSelectedTemplate | null> {
        const result = await this.prisma.userSelectedTemplate.findFirst({
            where: {
                bitrix_user_id: user_id,
                portal_id: portal_id,
                offer_template_id: template_id,
            },
            include: {
                offerTemplate: true,
            },
        });
        if (!result) return null;
        const entity = {
            ...result,
            id: String(result.id),
            offerTemplate: result.offerTemplate
                ? {
                      ...result.offerTemplate,
                      id: String(result.offerTemplate.id),
                  }
                : undefined,
        } as Partial<UserSelectedTemplate>;

        return new UserSelectedTemplate(entity);
    }

    async findCurrentByUser(
        user_id: bigint,
        portal_id: bigint,
    ): Promise<UserSelectedTemplate | null> {
        const result = (await this.prisma.userSelectedTemplate.findFirst({
            where: {
                bitrix_user_id: user_id,
                portal_id,
                is_current: true,
            },
            include: {
                offerTemplate: true,
            },
        })) as Partial<UserSelectedTemplate> | null;

        return result ? new UserSelectedTemplate(result) : null;
    }

    async findFavoritesByUser(
        user_id: bigint,
        portal_id: bigint,
    ): Promise<UserSelectedTemplate[]> {
        const results = (await this.prisma.userSelectedTemplate.findMany({
            where: {
                bitrix_user_id: user_id,
                portal_id,
                is_favorite: true,
            },
            include: {
                offerTemplate: true,
            },
            orderBy: { created_at: 'desc' },
        })) as UserSelectedWithOfferTemplate[];
        const entities = results.map(
            result =>
                ({
                    ...result,
                    id: String(result.id),
                    offerTemplate: result.offerTemplate
                        ? {
                              ...result.offerTemplate,
                              id: String(result.offerTemplate.id),
                          }
                        : undefined,
                }) as Partial<UserSelectedTemplate>,
        );

        return entities.map(entity => new UserSelectedTemplate(entity));
    }
}
