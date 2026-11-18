import { Controller, Get, Param, Query } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import {
    SiteArticlePublicDto,
    SiteArticlePublicListDto,
    SiteArticlePublicListItemDto,
    SiteArticlePublicQueryDto,
    SiteArticlePublicSectionParamsDto,
} from '../dto/site-article-public.dto';
import { SiteArticlesReaderService } from '../services/site-articles-reader.service';

/**
 * Статьи для сайта April: перечень раздела и статья целиком с медиа по
 * местам. Сайт берёт их при сборке страниц и сверяет раз в минуту (ISR);
 * открыто без ключа — здесь только опубликованное. Подключается в apps/bot,
 * рядом с картинками сайта (ai/rules/app-api-surface.md).
 */
@ApiTags('Site Articles')
@Controller('site-articles')
export class SiteArticlesPublicController {
    constructor(private readonly reader: SiteArticlesReaderService) {}

    @Get(':section')
    @ApiOperation({
        summary: 'Перечень статей раздела',
        description:
            'Опубликованные статьи раздела по порядку: адрес, заголовок, подводка, обложка, дата — без текста. Таблиц ещё нет — пустой перечень.',
    })
    @ApiOkResponse({
        type: SiteArticlePublicListDto,
        description: 'Опубликованные статьи.',
    })
    @ApiBadRequestResponse({ description: 'Раздела нет в перечне сайта.' })
    async list(
        @Param() { section }: SiteArticlePublicSectionParamsDto,
    ): Promise<SiteArticlePublicListDto> {
        const items = await this.reader.listSection(section);
        return {
            items: items.map(item => SiteArticlePublicListItemDto.from(item)),
        };
    }

    @Get(':section/article')
    @ApiOperation({
        summary: 'Статья целиком',
        description:
            'Опубликованный текст и медиа по местам. У главы из кода без публикации — content: null (сайт показывает текст из кода) и медиа мест.',
    })
    @ApiOkResponse({ type: SiteArticlePublicDto, description: 'Статья.' })
    @ApiBadRequestResponse({ description: 'Раздела нет в перечне сайта.' })
    @ApiNotFoundResponse({
        description: 'Статьи без кода нет или она не опубликована.',
    })
    async article(
        @Param() { section }: SiteArticlePublicSectionParamsDto,
        @Query() { slug }: SiteArticlePublicQueryDto,
    ): Promise<SiteArticlePublicDto> {
        return SiteArticlePublicDto.from(
            await this.reader.article(section, slug ?? ''),
        );
    }
}
