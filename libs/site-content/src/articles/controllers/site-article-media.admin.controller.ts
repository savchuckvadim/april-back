import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiBody,
    ApiConflictResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiServiceUnavailableResponse,
    ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Role, Roles } from '@lib/auth';
import { SiteArticleIdParamsDto } from '../dto/site-article.dto';
import {
    SiteArticleGalleryOrderDto,
    SiteArticleMediaLinkDto,
    SiteArticleMediaLinkListDto,
    SiteArticleMediaLinkParamsDto,
    SiteArticleMediaPutDto,
    SiteArticleMediaUnlinkedDto,
} from '../dto/site-article-media.dto';
import { SiteArticleMediaService } from '../services/site-article-media.service';
import {
    SITE_ARTICLES_ADMIN_PATH,
    SITE_ARTICLES_ADMIN_TAG,
    SITE_ARTICLES_TABLES_MISSING,
} from './site-articles.admin.controller';

/**
 * Медиа в статье: обложка, места в тексте, галерея. Привязка не
 * версионируется — на сайте видна через минуту, без публикации текста;
 * поэтому, как и публикация, — только суперпользователь.
 */
@ApiTags(SITE_ARTICLES_ADMIN_TAG)
@ApiBearerAuth()
@Roles(Role.SUPER_USER)
@ApiServiceUnavailableResponse({ description: SITE_ARTICLES_TABLES_MISSING })
@ApiNotFoundResponse({ description: 'Статьи, медиа или привязки нет.' })
@Controller(`${SITE_ARTICLES_ADMIN_PATH}/:id/media`)
export class SiteArticleMediaAdminController {
    constructor(private readonly media: SiteArticleMediaService) {}

    @Get()
    @ApiOperation({
        summary: 'Медиа статьи',
        description:
            'Обложка, места в тексте и галерея — с самим медиа из медиатеки.',
    })
    @ApiOkResponse({
        type: SiteArticleMediaLinkListDto,
        description: 'Привязки медиа.',
    })
    async list(
        @Param() { id }: SiteArticleIdParamsDto,
    ): Promise<SiteArticleMediaLinkListDto> {
        return SiteArticleMediaLinkListDto.of(await this.media.list(id));
    }

    @Put()
    @ApiOperation({
        summary: 'Поставить медиа в статью',
        description:
            'Обложка (только картинка) и место в тексте — одно медиа на место, повторная привязка заменяет. Галерея — в конец; то же медиа не дублируется, а обновляет подпись и порядок.',
    })
    @ApiBody({
        type: SiteArticleMediaPutDto,
        description: 'Роль, место, медиа, подпись.',
    })
    @ApiOkResponse({ type: SiteArticleMediaLinkDto, description: 'Привязка.' })
    @ApiBadRequestResponse({
        description: 'Обложка не картинка, у места в тексте нет id блока.',
    })
    @ApiConflictResponse({
        description: 'Место одновременно заняли — обновите страницу.',
    })
    async put(
        @Param() { id }: SiteArticleIdParamsDto,
        @Body() dto: SiteArticleMediaPutDto,
        @CurrentUser('login') login: string | undefined,
    ): Promise<SiteArticleMediaLinkDto> {
        return SiteArticleMediaLinkDto.from(
            await this.media.put(id, dto, login ?? null),
        );
    }

    @Put('gallery-order')
    @ApiOperation({
        summary: 'Порядок галереи',
        description: 'Все привязки галереи в новом порядке.',
    })
    @ApiBody({
        type: SiteArticleGalleryOrderDto,
        description: 'Id привязок по порядку.',
    })
    @ApiOkResponse({
        type: SiteArticleMediaLinkListDto,
        description: 'Галерея в новом порядке.',
    })
    @ApiConflictResponse({
        description: 'Галерею за это время изменили — обновите страницу.',
    })
    async reorder(
        @Param() { id }: SiteArticleIdParamsDto,
        @Body() dto: SiteArticleGalleryOrderDto,
    ): Promise<SiteArticleMediaLinkListDto> {
        return SiteArticleMediaLinkListDto.of(
            await this.media.reorderGallery(id, dto.linkIds),
        );
    }

    @Delete(':linkId')
    @ApiOperation({
        summary: 'Убрать медиа из статьи',
        description: 'Отвязывает медиа; в медиатеке оно остаётся.',
    })
    @ApiOkResponse({
        type: SiteArticleMediaUnlinkedDto,
        description: 'Медиа отвязано.',
    })
    async remove(
        @Param() { id, linkId }: SiteArticleMediaLinkParamsDto,
    ): Promise<SiteArticleMediaUnlinkedDto> {
        await this.media.remove(id, linkId);
        return { deleted: true };
    }
}
