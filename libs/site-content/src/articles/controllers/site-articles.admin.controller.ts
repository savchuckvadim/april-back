import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    Query,
} from '@nestjs/common';
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
import {
    SiteArticleCreateDto,
    SiteArticleEnsureDto,
    SiteArticleIdParamsDto,
    SiteArticleListQueryDto,
    SiteArticleUpdateDto,
} from '../dto/site-article.dto';
import {
    SiteArticleCardDto,
    SiteArticleRevisionDto,
} from '../dto/site-article-revision-view.dto';
import {
    SiteArticleDeletedDto,
    SiteArticleDto,
    SiteArticleEnsureResultDto,
    SiteArticleListDto,
} from '../dto/site-article-view.dto';
import { SiteArticleDraftsService } from '../services/site-article-drafts.service';
import { SiteArticlesService } from '../services/site-articles.service';

export const SITE_ARTICLES_ADMIN_PATH = 'admin/site-articles';
export const SITE_ARTICLES_ADMIN_TAG = 'Admin Site Articles';
export const SITE_ARTICLES_TABLES_MISSING =
    'Таблиц статей ещё нет — миграция базы не применена.';

/**
 * Статьи сайта в админке: перечень, карточка, создание, «взять главу из
 * кода», свойства, удаление неопубликованной. Только суперпользователь
 * (текст и медиа статей уходят на публичный сайт). Живёт только в
 * apps/admin (ai/rules/app-api-surface.md).
 */
@ApiTags(SITE_ARTICLES_ADMIN_TAG)
@ApiBearerAuth()
@Roles(Role.SUPER_USER)
@ApiServiceUnavailableResponse({ description: SITE_ARTICLES_TABLES_MISSING })
@Controller(SITE_ARTICLES_ADMIN_PATH)
export class SiteArticlesAdminController {
    constructor(
        private readonly articles: SiteArticlesService,
        private readonly drafts: SiteArticleDraftsService,
    ) {}

    @Get()
    @ApiOperation({
        summary: 'Статьи сайта: перечень',
        description:
            'Статьи с фильтром по разделу, типу и статусу; у каждой — номер последней и опубликованной версии и «есть черновик».',
    })
    @ApiOkResponse({
        type: SiteArticleListDto,
        description: 'Статьи по разделу и порядку.',
    })
    async list(
        @Query() query: SiteArticleListQueryDto,
    ): Promise<SiteArticleListDto> {
        const items = await this.articles.list(query);
        return { items: items.map(item => SiteArticleDto.from(item)) };
    }

    @Post()
    @HttpCode(200)
    @ApiOperation({
        summary: 'Создать статью',
        description:
            'Статья без кода в открытом разделе (articles): черновик без текста; текст — PUT /:id/draft с expectedNumber 0.',
    })
    @ApiBody({
        type: SiteArticleCreateDto,
        description: 'Раздел, тип, адрес, порядок, свойства.',
    })
    @ApiOkResponse({
        type: SiteArticleDto,
        description: 'Новая статья-черновик.',
    })
    @ApiBadRequestResponse({
        description:
            'Раздел с главами в коде, тип «глава», кривой адрес или свойства.',
    })
    @ApiConflictResponse({ description: 'Адрес уже занят в этом разделе.' })
    async create(
        @Body() dto: SiteArticleCreateDto,
        @CurrentUser('login') login: string | undefined,
    ): Promise<SiteArticleDto> {
        return SiteArticleDto.from(
            await this.articles.create(dto, login ?? null),
        );
    }

    @Post('ensure')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Строка для главы из кода',
        description:
            'Кнопка «взять текст из кода»: заводит строку главы (или возвращает уже заведённую). Сам текст из кода админка берёт у сайта и сохраняет черновиком с source = code.',
    })
    @ApiBody({
        type: SiteArticleEnsureDto,
        description: 'Раздел и адрес главы.',
    })
    @ApiOkResponse({
        type: SiteArticleEnsureResultDto,
        description: 'Строка главы.',
    })
    @ApiBadRequestResponse({
        description: 'В разделе нет глав в коде или адрес кривой.',
    })
    async ensure(
        @Body() dto: SiteArticleEnsureDto,
        @CurrentUser('login') login: string | undefined,
    ): Promise<SiteArticleEnsureResultDto> {
        const { article, created } = await this.articles.ensure(
            dto,
            login ?? null,
        );
        return { article: SiteArticleDto.from(article), created };
    }

    @Get(':id')
    @ApiOperation({
        summary: 'Карточка статьи',
        description:
            'Статья и последняя версия целиком — для редактора; номер последней версии — expectedNumber следующего сохранения.',
    })
    @ApiOkResponse({
        type: SiteArticleCardDto,
        description: 'Статья и последняя версия.',
    })
    @ApiNotFoundResponse({ description: 'Статьи нет.' })
    async card(
        @Param() { id }: SiteArticleIdParamsDto,
    ): Promise<SiteArticleCardDto> {
        const { article, latest } = await this.drafts.card(id);
        return {
            article: SiteArticleDto.from(article),
            latest: latest ? SiteArticleRevisionDto.fromRecord(latest) : null,
        };
    }

    @Patch(':id')
    @ApiOperation({
        summary: 'Свойства статьи',
        description:
            'Порядок и свойства — всегда; адрес и тип — только до первой публикации. Не переданное не меняется.',
    })
    @ApiBody({ type: SiteArticleUpdateDto, description: 'Что поменять.' })
    @ApiOkResponse({
        type: SiteArticleDto,
        description: 'Статья после правки.',
    })
    @ApiBadRequestResponse({
        description:
            'Адрес или тип после публикации, смена типа «глава», кривые данные.',
    })
    @ApiConflictResponse({ description: 'Адрес уже занят в этом разделе.' })
    @ApiNotFoundResponse({ description: 'Статьи нет.' })
    async update(
        @Param() { id }: SiteArticleIdParamsDto,
        @Body() dto: SiteArticleUpdateDto,
        @CurrentUser('login') login: string | undefined,
    ): Promise<SiteArticleDto> {
        return SiteArticleDto.from(
            await this.articles.update(id, dto, login ?? null),
        );
    }

    @Delete(':id')
    @ApiOperation({
        summary: 'Удалить статью навсегда',
        description:
            'Только статью, которую ни разу не публиковали, — вместе с версиями и привязками медиа. Публиковавшуюся — в архив.',
    })
    @ApiOkResponse({
        type: SiteArticleDeletedDto,
        description: 'Статья удалена.',
    })
    @ApiBadRequestResponse({
        description: 'Статью публиковали — только архив.',
    })
    @ApiNotFoundResponse({ description: 'Статьи нет.' })
    async remove(
        @Param() { id }: SiteArticleIdParamsDto,
    ): Promise<SiteArticleDeletedDto> {
        await this.articles.remove(id);
        return { deleted: true };
    }
}
