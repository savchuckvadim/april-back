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
    UploadedFiles,
    UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiBody,
    ApiConflictResponse,
    ApiConsumes,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiPayloadTooLargeResponse,
    ApiServiceUnavailableResponse,
    ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Role, Roles } from '@lib/auth';
import { toSiteMediaView } from '../domain/site-media-library.view';
import {
    SiteMediaLibraryEditDto,
    SiteMediaLibraryEmbedDto,
    SiteMediaLibraryIdParamsDto,
    SiteMediaLibraryListQueryDto,
    SiteMediaLibraryUploadDto,
} from '../dto/site-media-library.dto';
import {
    SiteMediaLibraryDeletedDto,
    SiteMediaLibraryListDto,
    SiteMediaUsageListDto,
    SiteMediaLibraryItemDto,
} from '../dto/site-media-library-view.dto';
import { SiteMediaLibraryService } from '../site-media-library.service';
import {
    firstUpload,
    SITE_MEDIA_LIBRARY_MULTER_LIMITS,
    type SiteMediaLibraryUploadParts,
} from './upload-parts';

export const SITE_MEDIA_LIBRARY_ADMIN_PATH = 'admin/site-media-library';
export const SITE_MEDIA_LIBRARY_ADMIN_TAG = 'Admin Site Media Library';

const TABLES_MISSING =
    'Таблицы медиатеки ещё нет — миграция базы не применена.';

/**
 * Медиатека сайта в админке: список, загрузка, внешнее видео, подписи,
 * «где используется», удаление. Файлы медиа — SiteMediaLibraryFilesAdminController.
 * Только суперпользователь: медиа в статьях меняется на сайте сразу, без
 * публикации текста. Живёт только в apps/admin (ai/rules/app-api-surface.md).
 */
@ApiTags(SITE_MEDIA_LIBRARY_ADMIN_TAG)
@ApiBearerAuth()
@Roles(Role.SUPER_USER)
@ApiServiceUnavailableResponse({ description: TABLES_MISSING })
@Controller(SITE_MEDIA_LIBRARY_ADMIN_PATH)
export class SiteMediaLibraryAdminController {
    constructor(private readonly library: SiteMediaLibraryService) {}

    @Get()
    @ApiOperation({
        summary: 'Медиатека: список',
        description:
            'Картинки, ролики и внешние видео постранично, свежие первыми. Фильтр по виду, «не используется» и поиск по названию, подписи и alt.',
    })
    @ApiOkResponse({
        type: SiteMediaLibraryListDto,
        description: 'Страница медиатеки.',
    })
    async list(
        @Query() query: SiteMediaLibraryListQueryDto,
    ): Promise<SiteMediaLibraryListDto> {
        return SiteMediaLibraryListDto.of(await this.library.list(query));
    }

    @Post()
    @HttpCode(200)
    @UseInterceptors(
        FileFieldsInterceptor(
            [
                { name: 'file', maxCount: 1 },
                { name: 'poster', maxCount: 1 },
                { name: 'dark', maxCount: 1 },
            ],
            { limits: { ...SITE_MEDIA_LIBRARY_MULTER_LIMITS, files: 3 } },
        ),
    )
    @ApiConsumes('multipart/form-data')
    @ApiOperation({
        summary: 'Загрузить картинку или ролик',
        description:
            'Файл пишется на сервер, затем появляется строка медиатеки; если строку записать не удалось, файл удаляется. У картинки ширину и высоту читает сервер, у ролика их присылает админка.',
    })
    @ApiBody({
        type: SiteMediaLibraryUploadDto,
        description: 'Файл, постер или тёмный вариант, подписи.',
    })
    @ApiOkResponse({
        type: SiteMediaLibraryItemDto,
        description: 'Загруженное медиа.',
    })
    @ApiBadRequestResponse({
        description:
            'Нет файла, формат не подходит, постер к картинке, тёмный вариант к ролику, ссылка не распознана.',
    })
    @ApiPayloadTooLargeResponse({
        description: 'Картинка больше 10 МБ или видео больше 80 МБ.',
    })
    async upload(
        @UploadedFiles() files: SiteMediaLibraryUploadParts | undefined,
        @Body() dto: SiteMediaLibraryUploadDto,
        @CurrentUser('login') login: string | undefined,
    ): Promise<SiteMediaLibraryItemDto> {
        const record = await this.library.upload(
            {
                ...dto,
                file: firstUpload(files?.file),
                poster: firstUpload(files?.poster),
                dark: firstUpload(files?.dark),
            },
            login ?? null,
        );
        return SiteMediaLibraryItemDto.from(toSiteMediaView(record));
    }

    @Post('embed')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Добавить внешнее видео',
        description:
            'Медиа без файла: ролик YouTube, Rutube или VK Видео. В базе — поставщик и id ролика, адрес плеера сайт собирает сам.',
    })
    @ApiBody({
        type: SiteMediaLibraryEmbedDto,
        description: 'Ссылка и подписи.',
    })
    @ApiOkResponse({
        type: SiteMediaLibraryItemDto,
        description: 'Новое внешнее видео.',
    })
    @ApiBadRequestResponse({ description: 'Ссылка не распознана.' })
    async createEmbed(
        @Body() dto: SiteMediaLibraryEmbedDto,
        @CurrentUser('login') login: string | undefined,
    ): Promise<SiteMediaLibraryItemDto> {
        const record = await this.library.createEmbed(dto, login ?? null);
        return SiteMediaLibraryItemDto.from(toSiteMediaView(record));
    }

    @Get(':id')
    @ApiOperation({
        summary: 'Медиа по id',
        description: 'Строка медиатеки с адресами файлов на сайте.',
    })
    @ApiOkResponse({ type: SiteMediaLibraryItemDto, description: 'Медиа.' })
    @ApiNotFoundResponse({ description: 'Медиа нет в медиатеке.' })
    async get(
        @Param() { id }: SiteMediaLibraryIdParamsDto,
    ): Promise<SiteMediaLibraryItemDto> {
        return SiteMediaLibraryItemDto.from(
            toSiteMediaView(await this.library.get(id)),
        );
    }

    @Get(':id/usage')
    @ApiOperation({
        summary: 'Где используется медиа',
        description:
            'Статьи и места в них, где стоит медиа: обложка, место в тексте, галерея.',
    })
    @ApiOkResponse({
        type: SiteMediaUsageListDto,
        description: 'Места в статьях.',
    })
    @ApiNotFoundResponse({ description: 'Медиа нет в медиатеке.' })
    async usage(
        @Param() { id }: SiteMediaLibraryIdParamsDto,
    ): Promise<SiteMediaUsageListDto> {
        return { items: await this.library.usage(id) };
    }

    @Patch(':id')
    @ApiOperation({
        summary: 'Подписи и внешняя ссылка',
        description:
            'Название, подпись, alt, размеры ролика и внешняя ссылка. Не переданное поле не меняется; пустая строка или null снимает подпись. На сайте правка видна через минуту, без публикации статей.',
    })
    @ApiBody({ type: SiteMediaLibraryEditDto, description: 'Что поменять.' })
    @ApiOkResponse({
        type: SiteMediaLibraryItemDto,
        description: 'Медиа после правки.',
    })
    @ApiBadRequestResponse({
        description:
            'Ссылка у картинки, снятие ссылки у внешнего видео, размеры у картинки, ссылка не распознана.',
    })
    @ApiNotFoundResponse({ description: 'Медиа нет в медиатеке.' })
    async edit(
        @Param() { id }: SiteMediaLibraryIdParamsDto,
        @Body() dto: SiteMediaLibraryEditDto,
    ): Promise<SiteMediaLibraryItemDto> {
        return SiteMediaLibraryItemDto.from(
            toSiteMediaView(await this.library.edit(id, dto)),
        );
    }

    @Delete(':id')
    @ApiOperation({
        summary: 'Удалить медиа',
        description:
            'Только медиа, которое не стоит ни в одной статье: сначала удаляется строка, затем файлы.',
    })
    @ApiOkResponse({
        type: SiteMediaLibraryDeletedDto,
        description: 'Медиа удалено.',
    })
    @ApiNotFoundResponse({ description: 'Медиа нет в медиатеке.' })
    @ApiConflictResponse({
        description:
            'Медиа стоит в статьях — в тексте ошибки перечислены статьи.',
    })
    async remove(
        @Param() { id }: SiteMediaLibraryIdParamsDto,
    ): Promise<SiteMediaLibraryDeletedDto> {
        await this.library.remove(id);
        return { deleted: true };
    }
}
