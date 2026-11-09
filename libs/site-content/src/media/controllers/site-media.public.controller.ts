import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiProduces,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { SITE_MEDIA_FORMATS } from '../domain/media-format';
import {
    SiteMediaFileParamsDto,
    SiteMediaListDto,
    SiteMediaSectionParamsDto,
} from '../dto/site-media.dto';
import { SiteMediaService } from '../site-media.service';

/** Имя файла содержит отпечаток содержимого — кешировать можно сколько угодно. */
export const SITE_MEDIA_CACHE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

const NOT_FOUND = 'Файл не найден';

const MEDIA_MIME_TYPES = [
    ...new Set(Object.values(SITE_MEDIA_FORMATS).map(format => format.mime)),
];

const hasStatus = (error: unknown, status: number): boolean =>
    typeof error === 'object' &&
    error !== null &&
    (error as { status?: unknown }).status === status;

/**
 * Картинки и видео для сайта April. Сайт берёт список при сборке страниц и
 * сверяет раз в минуту (ISR), а файлы проксирует со своего адреса
 * /media/<раздел>/<файл> — браузер сюда не ходит, адрес сервера не виден.
 *
 * Открыт без ключа: здесь только то, что и так видно на страницах сайта.
 * Подключается в apps/bot (ai/rules/app-api-surface.md).
 */
@ApiTags('Site Media')
@Controller('site-media')
export class SiteMediaPublicController {
    constructor(private readonly media: SiteMediaService) {}

    @Get(':section')
    @ApiOperation({
        summary: 'Картинки и видео раздела для сайта',
        description:
            'Что загружено на места кадров раздела. Сайт сверяет список раз в минуту, поэтому загруженное в админке появляется без выкладки.',
    })
    @ApiOkResponse({
        type: SiteMediaListDto,
        description: 'Загруженные кадры раздела по местам.',
    })
    @ApiBadRequestResponse({
        description: 'Раздел не по шаблону (латиница, цифры, дефисы).',
    })
    async list(
        @Param() { section }: SiteMediaSectionParamsDto,
    ): Promise<SiteMediaListDto> {
        return SiteMediaListDto.of(await this.media.list(section));
    }

    @Get(':section/files/:file')
    @ApiOperation({
        summary: 'Файл картинки или видео',
        description:
            'Отдаёт файл с поддержкой Range (перемотка видео) и вечным кешем: в имени отпечаток содержимого, замена даёт новое имя.',
    })
    @ApiProduces(...MEDIA_MIME_TYPES)
    @ApiOkResponse({
        description: 'Файл целиком.',
        schema: { type: 'string', format: 'binary' },
    })
    @ApiResponse({
        status: 206,
        description:
            'Запрошенный заголовком Range кусок файла — так браузер перематывает видео.',
        schema: { type: 'string', format: 'binary' },
    })
    @ApiBadRequestResponse({
        description: 'Раздел или имя файла не по шаблону медиа.',
    })
    @ApiNotFoundResponse({
        description: 'Такого файла в разделе нет — заменён новым или удалён.',
    })
    async file(
        @Param() { section, file }: SiteMediaFileParamsDto,
        @Res() res: Response,
    ): Promise<void> {
        const resolved = await this.media.resolveFile(section, file);
        if (!resolved) throw new NotFoundException(NOT_FOUND);

        res.setHeader('Content-Type', resolved.mime);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        await new Promise<void>((done, fail) => {
            res.sendFile(
                resolved.name,
                {
                    root: resolved.root,
                    maxAge: SITE_MEDIA_CACHE_MAX_AGE_MS,
                    immutable: true,
                },
                (error?: Error) => {
                    // Обрыв посетителем посреди ролика — не ошибка сервера.
                    if (!error || res.headersSent) return done();
                    // Ответ об ошибке уйдёт JSON-ом — без типа картинки.
                    res.removeHeader('Content-Type');
                    res.removeHeader('X-Content-Type-Options');
                    fail(
                        hasStatus(error, 404)
                            ? new NotFoundException(NOT_FOUND)
                            : error,
                    );
                },
            );
        });
    }
}
