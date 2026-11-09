import {
    Controller,
    Delete,
    Get,
    Param,
    Put,
    UploadedFiles,
    UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
    ApiBadRequestResponse,
    ApiBody,
    ApiConsumes,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiPayloadTooLargeResponse,
    ApiTags,
} from '@nestjs/swagger';
import {
    SITE_MEDIA_MAX_UPLOAD_BYTES,
    type SiteMediaUpload,
} from '../domain/site-media.types';
import {
    SiteMediaDeletedDto,
    SiteMediaItemDto,
    SiteMediaListDto,
    SiteMediaSectionParamsDto,
    SiteMediaSlotParamsDto,
    SiteMediaUploadDto,
} from '../dto/site-media.dto';
import { SiteMediaService } from '../site-media.service';

/** Части multipart-запроса загрузки (FileFieldsInterceptor). */
export interface SiteMediaUploadFiles {
    file?: Express.Multer.File[];
    poster?: Express.Multer.File[];
}

const firstUpload = (
    files: Express.Multer.File[] | undefined,
): SiteMediaUpload | undefined =>
    files?.[0] ? { buffer: files[0].buffer } : undefined;

/**
 * Картинки и видео сайта в админке: что загружено на места кадров, загрузка,
 * замена и удаление. Живёт только в apps/admin (ai/rules/app-api-surface.md);
 * сайт читает те же файлы через публичный SiteMediaPublicController (apps/bot).
 */
@ApiTags('Admin Site Media')
@Controller('admin/site-media')
export class SiteMediaAdminController {
    constructor(private readonly media: SiteMediaService) {}

    @Get(':section')
    @ApiOperation({
        summary: 'Картинки и видео раздела сайта',
        description:
            'Что сейчас загружено на места кадров раздела (например, лендинга /platform). Места без файла админка берёт из реестра кадров сайта.',
    })
    @ApiOkResponse({
        type: SiteMediaListDto,
        description: 'Загруженные кадры раздела по местам.',
    })
    async list(
        @Param() { section }: SiteMediaSectionParamsDto,
    ): Promise<SiteMediaListDto> {
        return SiteMediaListDto.of(await this.media.list(section));
    }

    @Put(':section/:slot')
    @UseInterceptors(
        FileFieldsInterceptor(
            [
                { name: 'file', maxCount: 1 },
                { name: 'poster', maxCount: 1 },
            ],
            { limits: { fileSize: SITE_MEDIA_MAX_UPLOAD_BYTES, files: 2 } },
        ),
    )
    @ApiConsumes('multipart/form-data')
    @ApiOperation({
        summary: 'Загрузить или заменить кадр',
        description:
            'Кладёт картинку или видео на место кадра; прежний файл удаляется после записи нового. Постер видео можно прислать вместе с роликом или отдельно. На сайте замена появится при ближайшей сверке списка — в течение пары минут, без выкладки.',
    })
    @ApiBody({
        type: SiteMediaUploadDto,
        description: 'Файл кадра и (или) постер видео.',
    })
    @ApiOkResponse({
        type: SiteMediaItemDto,
        description: 'Что теперь стоит на месте кадра.',
    })
    @ApiBadRequestResponse({
        description:
            'Нет файла, формат не подходит, постер к картинке или постер без ролика.',
    })
    @ApiPayloadTooLargeResponse({
        description: 'Картинка больше 10 МБ или видео больше 80 МБ.',
    })
    async put(
        @Param() { section, slot }: SiteMediaSlotParamsDto,
        @UploadedFiles() files: SiteMediaUploadFiles | undefined,
    ): Promise<SiteMediaItemDto> {
        const item = await this.media.put(section, slot, {
            file: firstUpload(files?.file),
            poster: firstUpload(files?.poster),
        });
        return SiteMediaItemDto.from(item);
    }

    @Delete(':section/:slot/poster')
    @ApiOperation({
        summary: 'Убрать постер видео',
        description:
            'Удаляет постер ролика; видео остаётся, до запуска браузер покажет его первый кадр.',
    })
    @ApiOkResponse({
        type: SiteMediaItemDto,
        description: 'Видео на месте кадра — уже без постера.',
    })
    @ApiNotFoundResponse({
        description: 'На месте ничего не загружено или у видео нет постера.',
    })
    async removePoster(
        @Param() { section, slot }: SiteMediaSlotParamsDto,
    ): Promise<SiteMediaItemDto> {
        return SiteMediaItemDto.from(
            await this.media.removePoster(section, slot),
        );
    }

    @Delete(':section/:slot')
    @ApiOperation({
        summary: 'Удалить кадр',
        description:
            'Удаляет файл кадра и постер. На проде место без файла на сайте не рисуется: блок перестраивается без кадра.',
    })
    @ApiOkResponse({
        type: SiteMediaDeletedDto,
        description: 'Файлы места удалены.',
    })
    @ApiNotFoundResponse({ description: 'На месте ничего не загружено.' })
    async remove(
        @Param() { section, slot }: SiteMediaSlotParamsDto,
    ): Promise<SiteMediaDeletedDto> {
        await this.media.remove(section, slot);
        return { deleted: true };
    }
}
