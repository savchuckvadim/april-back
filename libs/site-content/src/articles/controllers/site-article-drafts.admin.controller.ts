import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    Put,
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
import { SiteArticleIdParamsDto } from '../dto/site-article.dto';
import {
    SiteArticleDraftDto,
    SiteArticleRestoreDto,
    SiteArticleRevisionParamsDto,
} from '../dto/site-article-draft.dto';
import {
    SiteArticleRevisionDto,
    SiteArticleRevisionListDto,
    SiteArticleRevisionSummaryDto,
    SiteArticleSavedDto,
} from '../dto/site-article-revision-view.dto';
import { SiteArticleDraftsService } from '../services/site-article-drafts.service';
import {
    SITE_ARTICLES_ADMIN_PATH,
    SITE_ARTICLES_ADMIN_TAG,
    SITE_ARTICLES_TABLES_MISSING,
} from './site-articles.admin.controller';

const CONFLICT =
    'Текст уже изменили (появилась версия новее expectedNumber) — обновите страницу.';

/**
 * Текст статьи: черновик (новая неизменная версия), история, версия
 * целиком, «вернуть прежнюю» копией. Публикация — отдельной ручкой.
 */
@ApiTags(SITE_ARTICLES_ADMIN_TAG)
@ApiBearerAuth()
@Roles(Role.SUPER_USER)
@ApiServiceUnavailableResponse({ description: SITE_ARTICLES_TABLES_MISSING })
@ApiNotFoundResponse({ description: 'Статьи или версии нет.' })
@Controller(SITE_ARTICLES_ADMIN_PATH)
export class SiteArticleDraftsAdminController {
    constructor(private readonly drafts: SiteArticleDraftsService) {}

    @Put(':id/draft')
    @ApiOperation({
        summary: 'Сохранить черновик',
        description:
            'Каждое сохранение — новая неизменная версия; на сайте она появится только после публикации. Блоки проверяются по формату раздела.',
    })
    @ApiBody({
        type: SiteArticleDraftDto,
        description: 'Текст статьи и ожидаемый номер версии.',
    })
    @ApiOkResponse({
        type: SiteArticleSavedDto,
        description: 'Новая версия и статья с новым номером.',
    })
    @ApiBadRequestResponse({
        description:
            'Блоки не прошли проверку (список в errors), формат не раздела, статья в архиве.',
    })
    @ApiConflictResponse({ description: CONFLICT })
    async save(
        @Param() { id }: SiteArticleIdParamsDto,
        @Body() dto: SiteArticleDraftDto,
        @CurrentUser('login') login: string | undefined,
    ): Promise<SiteArticleSavedDto> {
        const { revision, article } = await this.drafts.save(
            id,
            dto,
            login ?? null,
        );
        return SiteArticleSavedDto.of(revision, article);
    }

    @Get(':id/revisions')
    @ApiOperation({
        summary: 'История версий',
        description: 'Версии статьи, новые первыми, без текста.',
    })
    @ApiOkResponse({
        type: SiteArticleRevisionListDto,
        description: 'История версий.',
    })
    async list(
        @Param() { id }: SiteArticleIdParamsDto,
    ): Promise<SiteArticleRevisionListDto> {
        const items = await this.drafts.list(id);
        return {
            items: items.map(item => SiteArticleRevisionSummaryDto.from(item)),
        };
    }

    @Get(':id/revisions/:revisionId')
    @ApiOperation({
        summary: 'Версия целиком',
        description: 'Текст и блоки одной версии — для просмотра и сравнения.',
    })
    @ApiOkResponse({ type: SiteArticleRevisionDto, description: 'Версия.' })
    async get(
        @Param() { id, revisionId }: SiteArticleRevisionParamsDto,
    ): Promise<SiteArticleRevisionDto> {
        return SiteArticleRevisionDto.fromRecord(
            await this.drafts.get(id, revisionId),
        );
    }

    @Post(':id/revisions/:revisionId/restore')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Вернуть прежнюю версию',
        description:
            'Копия выбранной версии становится новой последней (source = restore); на сайт она попадёт после публикации.',
    })
    @ApiBody({
        type: SiteArticleRestoreDto,
        description: 'Ожидаемый номер последней версии и пометка.',
    })
    @ApiOkResponse({
        type: SiteArticleSavedDto,
        description: 'Копия и статья с новым номером.',
    })
    @ApiBadRequestResponse({ description: 'Статья в архиве.' })
    @ApiConflictResponse({ description: CONFLICT })
    async restore(
        @Param() { id, revisionId }: SiteArticleRevisionParamsDto,
        @Body() dto: SiteArticleRestoreDto,
        @CurrentUser('login') login: string | undefined,
    ): Promise<SiteArticleSavedDto> {
        const { revision, article } = await this.drafts.restore(
            id,
            revisionId,
            dto.expectedNumber,
            dto.comment,
            login ?? null,
        );
        return SiteArticleSavedDto.of(revision, article);
    }
}
