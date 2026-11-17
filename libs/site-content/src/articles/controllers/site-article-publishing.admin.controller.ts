import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiBody,
    ApiConflictResponse,
    ApiForbiddenResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiServiceUnavailableResponse,
    ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Role, Roles } from '@lib/auth';
import { SiteArticleIdParamsDto } from '../dto/site-article.dto';
import { SiteArticlePublishDto } from '../dto/site-article-draft.dto';
import { SiteArticleDto } from '../dto/site-article-view.dto';
import { SiteArticlePublishingService } from '../services/site-article-publishing.service';
import {
    SITE_ARTICLES_ADMIN_PATH,
    SITE_ARTICLES_ADMIN_TAG,
    SITE_ARTICLES_TABLES_MISSING,
} from './site-articles.admin.controller';

/**
 * Статус статьи на публичном сайте: опубликовать версию, снять, в архив и
 * из архива. Только суперпользователь — готовая проверка роли админки
 * (@Roles(Role.SUPER_USER), глобальные гарды AuthModule в apps/admin).
 * Сайт подхватывает изменение при ближайшей сверке — в течение минуты.
 */
@ApiTags(SITE_ARTICLES_ADMIN_TAG)
@ApiBearerAuth()
@Roles(Role.SUPER_USER)
@ApiForbiddenResponse({
    description: 'Публиковать может только суперпользователь.',
})
@ApiServiceUnavailableResponse({ description: SITE_ARTICLES_TABLES_MISSING })
@ApiNotFoundResponse({ description: 'Статьи или версии нет.' })
@ApiConflictResponse({
    description: 'Статус статьи уже изменился — обновите страницу.',
})
@Controller(SITE_ARTICLES_ADMIN_PATH)
export class SiteArticlePublishingAdminController {
    constructor(private readonly publishing: SiteArticlePublishingService) {}

    @Post(':id/publish')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Опубликовать версию',
        description:
            'Выбранная версия становится действующей на сайте; более новые остаются черновиком. Любая версия статьи — так же делается откат.',
    })
    @ApiBody({
        type: SiteArticlePublishDto,
        description: 'Какую версию опубликовать.',
    })
    @ApiOkResponse({
        type: SiteArticleDto,
        description: 'Опубликованная статья.',
    })
    @ApiBadRequestResponse({ description: 'Статья в архиве.' })
    async publish(
        @Param() { id }: SiteArticleIdParamsDto,
        @Body() dto: SiteArticlePublishDto,
        @CurrentUser('login') login: string | undefined,
    ): Promise<SiteArticleDto> {
        return SiteArticleDto.from(
            await this.publishing.publish(id, dto.revisionId, login ?? null),
        );
    }

    @Post(':id/unpublish')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Снять с сайта',
        description:
            'У главы из кода сайт вернётся к тексту из кода, статья без кода пропадёт (404). Версии и адрес сохраняются.',
    })
    @ApiOkResponse({ type: SiteArticleDto, description: 'Снятая статья.' })
    @ApiBadRequestResponse({ description: 'Статья не опубликована.' })
    async unpublish(
        @Param() { id }: SiteArticleIdParamsDto,
        @CurrentUser('login') login: string | undefined,
    ): Promise<SiteArticleDto> {
        return SiteArticleDto.from(
            await this.publishing.unpublish(id, login ?? null),
        );
    }

    @Post(':id/archive')
    @HttpCode(200)
    @ApiOperation({
        summary: 'В архив',
        description:
            'Статья уходит с сайта; адрес остаётся занятым, история цела.',
    })
    @ApiOkResponse({ type: SiteArticleDto, description: 'Статья в архиве.' })
    @ApiBadRequestResponse({ description: 'Статья уже в архиве.' })
    async archive(
        @Param() { id }: SiteArticleIdParamsDto,
        @CurrentUser('login') login: string | undefined,
    ): Promise<SiteArticleDto> {
        return SiteArticleDto.from(
            await this.publishing.archive(id, login ?? null),
        );
    }

    @Post(':id/unarchive')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Вернуть из архива',
        description:
            'Публиковавшаяся статья возвращается снятой, никогда не публиковавшаяся — черновиком; на сайт — отдельной публикацией.',
    })
    @ApiOkResponse({ type: SiteArticleDto, description: 'Статья вне архива.' })
    @ApiBadRequestResponse({ description: 'Статья не в архиве.' })
    async unarchive(
        @Param() { id }: SiteArticleIdParamsDto,
        @CurrentUser('login') login: string | undefined,
    ): Promise<SiteArticleDto> {
        return SiteArticleDto.from(
            await this.publishing.unarchive(id, login ?? null),
        );
    }
}
