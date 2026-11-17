import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Param,
    Put,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiBody,
    ApiConsumes,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiPayloadTooLargeResponse,
    ApiTags,
} from '@nestjs/swagger';
import { Role, Roles } from '@lib/auth';
import { SITE_MEDIA_LIBRARY_MESSAGES } from '../domain/site-media-library.messages';
import type { SiteMediaLibraryUpload } from '../domain/site-media-library.types';
import { toSiteMediaView } from '../domain/site-media-library.view';
import {
    SiteMediaLibraryExtraFileDto,
    SiteMediaLibraryIdParamsDto,
    SiteMediaLibraryReplaceDto,
} from '../dto/site-media-library.dto';
import { SiteMediaLibraryItemDto } from '../dto/site-media-library-view.dto';
import { SiteMediaLibraryFilesService } from '../site-media-library-files.service';
import {
    SITE_MEDIA_LIBRARY_ADMIN_PATH,
    SITE_MEDIA_LIBRARY_ADMIN_TAG,
} from './site-media-library.admin.controller';
import { SITE_MEDIA_LIBRARY_MULTER_LIMITS, uploadOf } from './upload-parts';

const singleFile = () =>
    UseInterceptors(
        FileInterceptor('file', {
            limits: { ...SITE_MEDIA_LIBRARY_MULTER_LIMITS, files: 1 },
        }),
    );

const requireFile = (
    file: Express.Multer.File | undefined,
): SiteMediaLibraryUpload => {
    const upload = uploadOf(file);
    if (!upload) {
        throw new BadRequestException(SITE_MEDIA_LIBRARY_MESSAGES.fileRequired);
    }
    return upload;
};

const view = (record: Parameters<typeof toSiteMediaView>[0]) =>
    SiteMediaLibraryItemDto.from(toSiteMediaView(record));

/**
 * Файлы уже загруженного медиа: замена, постер ролика, тёмный вариант
 * картинки. Новое имя файла — новый адрес, поэтому замена видна на сайте
 * сразу после сверки (раз в минуту). Только apps/admin, только суперпользователь.
 */
@ApiTags(SITE_MEDIA_LIBRARY_ADMIN_TAG)
@ApiBearerAuth()
@Roles(Role.SUPER_USER)
@ApiNotFoundResponse({ description: 'Медиа нет в медиатеке.' })
@ApiPayloadTooLargeResponse({
    description: 'Картинка больше 10 МБ или видео больше 80 МБ.',
})
@Controller(SITE_MEDIA_LIBRARY_ADMIN_PATH)
export class SiteMediaLibraryFilesAdminController {
    constructor(private readonly files: SiteMediaLibraryFilesService) {}

    @Put(':id/file')
    @singleFile()
    @ApiConsumes('multipart/form-data')
    @ApiOperation({
        summary: 'Заменить файл медиа',
        description:
            'Картинку меняют картинкой, ролик — роликом; во всех статьях, где стоит медиа, кадр сменится сам. Постер и тёмный вариант остаются.',
    })
    @ApiBody({ type: SiteMediaLibraryReplaceDto, description: 'Новый файл.' })
    @ApiOkResponse({
        type: SiteMediaLibraryItemDto,
        description: 'Медиа с новым файлом.',
    })
    @ApiBadRequestResponse({
        description:
            'Нет файла, другой вид, формат не подходит, у внешнего видео нет файла.',
    })
    async replace(
        @Param() { id }: SiteMediaLibraryIdParamsDto,
        @UploadedFile() file: Express.Multer.File | undefined,
        @Body() dto: SiteMediaLibraryReplaceDto,
    ): Promise<SiteMediaLibraryItemDto> {
        const { width, height, durationSec } = dto;
        return view(
            await this.files.replaceFile(id, requireFile(file), {
                width,
                height,
                durationSec,
            }),
        );
    }

    @Put(':id/poster')
    @singleFile()
    @ApiConsumes('multipart/form-data')
    @ApiOperation({
        summary: 'Поставить постер ролика',
        description: 'Картинка, которую ролик показывает до запуска.',
    })
    @ApiBody({ type: SiteMediaLibraryExtraFileDto, description: 'Постер.' })
    @ApiOkResponse({
        type: SiteMediaLibraryItemDto,
        description: 'Ролик с постером.',
    })
    @ApiBadRequestResponse({
        description: 'Не ролик или постер — не картинка.',
    })
    async setPoster(
        @Param() { id }: SiteMediaLibraryIdParamsDto,
        @UploadedFile() file: Express.Multer.File | undefined,
    ): Promise<SiteMediaLibraryItemDto> {
        return view(await this.files.setPoster(id, requireFile(file)));
    }

    @Delete(':id/poster')
    @ApiOperation({
        summary: 'Убрать постер ролика',
        description: 'До запуска браузер покажет первый кадр ролика.',
    })
    @ApiOkResponse({
        type: SiteMediaLibraryItemDto,
        description: 'Ролик без постера.',
    })
    @ApiBadRequestResponse({ description: 'Медиа — не ролик.' })
    async removePoster(
        @Param() { id }: SiteMediaLibraryIdParamsDto,
    ): Promise<SiteMediaLibraryItemDto> {
        return view(await this.files.removePoster(id));
    }

    @Put(':id/dark')
    @singleFile()
    @ApiConsumes('multipart/form-data')
    @ApiOperation({
        summary: 'Поставить тёмный вариант картинки',
        description:
            'Сайт показывает его в тёмной теме вместо основной картинки.',
    })
    @ApiBody({
        type: SiteMediaLibraryExtraFileDto,
        description: 'Тёмный вариант.',
    })
    @ApiOkResponse({
        type: SiteMediaLibraryItemDto,
        description: 'Картинка с тёмным вариантом.',
    })
    @ApiBadRequestResponse({ description: 'Не картинка или файл не читается.' })
    async setDark(
        @Param() { id }: SiteMediaLibraryIdParamsDto,
        @UploadedFile() file: Express.Multer.File | undefined,
    ): Promise<SiteMediaLibraryItemDto> {
        return view(await this.files.setDark(id, requireFile(file)));
    }

    @Delete(':id/dark')
    @ApiOperation({
        summary: 'Убрать тёмный вариант картинки',
        description: 'Дальше одна картинка на обе темы сайта.',
    })
    @ApiOkResponse({
        type: SiteMediaLibraryItemDto,
        description: 'Картинка без тёмного варианта.',
    })
    @ApiBadRequestResponse({ description: 'Медиа — не картинка.' })
    async removeDark(
        @Param() { id }: SiteMediaLibraryIdParamsDto,
    ): Promise<SiteMediaLibraryItemDto> {
        return view(await this.files.removeDark(id));
    }
}
