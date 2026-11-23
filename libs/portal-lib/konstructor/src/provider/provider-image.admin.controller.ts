import {
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseIntPipe,
    Put,
    Res,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBody,
    ApiConsumes,
    ApiNoContentResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiProduces,
    ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
    PROVIDER_IMAGE_MIME,
    PROVIDER_IMAGE_ROLES,
    ProviderImageService,
} from '../provider-image';
import {
    ProviderImageResponseDto,
    ProviderImageUploadDto,
} from './provider-image.dto';
import { ProviderImageUploadInterceptor } from './provider-image-upload.interceptor';

const RQ_ID_PARAM = {
    name: 'rqId',
    type: Number,
    description: 'Id реквизитов поставщика (`rqs.id`).',
    example: 12,
} as const;

const ROLE_PARAM = {
    name: 'role',
    enum: PROVIDER_IMAGE_ROLES,
    enumName: 'ProviderImageRole',
    description:
        'Роль картинки: stamp — печать, signature_director — подпись руководителя, signature_accountant — подпись главного бухгалтера, logo — логотип.',
    example: 'stamp',
} as const;

/**
 * Админ-ручки картинок поставщика: печать, подписи и логотип реквизитов.
 * Живут рядом с остальными ручками поставщиков (`admin/portal/provider`), а
 * правила и хранение — в `ProviderImageService`. PDF-КП печатает эти картинки,
 * когда в настройках включено «с печатями и подписями».
 */
@ApiTags('Admin Portal Provider')
@Controller('admin/portal/provider')
export class ProviderImageAdminController {
    constructor(private readonly images: ProviderImageService) {}

    @Get('rq/:rqId/images')
    @ApiOperation({
        summary: 'Картинки реквизитов поставщика',
        description:
            'Печать, подписи и логотип реквизитов: по одной записи на роль, ' +
            'по порядку ролей. Роль без картинки в списке не появляется.',
    })
    @ApiParam(RQ_ID_PARAM)
    @ApiOkResponse({
        type: [ProviderImageResponseDto],
        description: 'Загруженные картинки; пустой список, если их нет.',
    })
    @ApiNotFoundResponse({ description: 'Реквизиты не найдены.' })
    async listImages(
        @Param('rqId', ParseIntPipe) rqId: number,
    ): Promise<ProviderImageResponseDto[]> {
        const images = await this.images.list(rqId);
        return images.map(image => ProviderImageResponseDto.from(image));
    }

    @Put('rq/:rqId/images/:role')
    @UseInterceptors(ProviderImageUploadInterceptor)
    @ApiConsumes('multipart/form-data')
    @ApiOperation({
        summary: 'Загрузить или заменить картинку реквизитов',
        description:
            'Кладёт картинку на роль: PNG или JPG до 2 МБ (формат определяется ' +
            'по содержимому, не больше 6000 пикселей по стороне). Прежняя ' +
            'картинка роли заменяется: сначала записывается новый файл, затем ' +
            'удаляется старый.',
    })
    @ApiParam(RQ_ID_PARAM)
    @ApiParam(ROLE_PARAM)
    @ApiBody({
        type: ProviderImageUploadDto,
        description: 'Файл картинки в поле `file`.',
    })
    @ApiOkResponse({
        type: ProviderImageResponseDto,
        description: 'Картинка, которая теперь стоит на роли.',
    })
    @ApiBadRequestResponse({
        description:
            'Неизвестная роль, файл не передан, формат не поддерживается (нужны PNG или JPG), файл не читается как картинка или превышен размер.',
    })
    @ApiNotFoundResponse({ description: 'Реквизиты не найдены.' })
    async uploadImage(
        @Param('rqId', ParseIntPipe) rqId: number,
        @Param('role') role: string,
        @UploadedFile() file: Express.Multer.File | undefined,
    ): Promise<ProviderImageResponseDto> {
        const image = await this.images.put(rqId, role, {
            buffer: file?.buffer,
            originalName: file?.originalname,
        });
        return ProviderImageResponseDto.from(image);
    }

    @Get('rq/:rqId/images/:role/file')
    @ApiOperation({
        summary: 'Файл картинки реквизитов',
        description:
            'Отдаёт сам файл для превью в админке. Ответ не кэшируется: ' +
            'после замены превью показывает новую картинку.',
    })
    @ApiParam(RQ_ID_PARAM)
    @ApiParam(ROLE_PARAM)
    @ApiProduces(...new Set(Object.values(PROVIDER_IMAGE_MIME)))
    @ApiOkResponse({
        description: 'Файл картинки.',
        schema: { type: 'string', format: 'binary' },
    })
    @ApiBadRequestResponse({ description: 'Неизвестная роль.' })
    @ApiNotFoundResponse({
        description:
            'У реквизитов нет такой картинки или её файла нет на сервере.',
    })
    async getImageFile(
        @Param('rqId', ParseIntPipe) rqId: number,
        @Param('role') role: string,
        @Res() res: Response,
    ): Promise<void> {
        const { image, content } = await this.images.readFile(rqId, role);
        res.setHeader('Content-Type', PROVIDER_IMAGE_MIME[image.format]);
        res.setHeader('Content-Length', content.length);
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.end(content);
    }

    @Delete('rq/:rqId/images/:role')
    @HttpCode(204)
    @ApiOperation({
        summary: 'Удалить картинку реквизитов',
        description:
            'Удаляет запись и файл картинки. Документы после этого печатаются ' +
            'без неё. Если картинки нет — 404.',
    })
    @ApiParam(RQ_ID_PARAM)
    @ApiParam(ROLE_PARAM)
    @ApiNoContentResponse({ description: 'Картинка удалена.' })
    @ApiBadRequestResponse({ description: 'Неизвестная роль.' })
    @ApiNotFoundResponse({ description: 'У реквизитов нет такой картинки.' })
    async removeImage(
        @Param('rqId', ParseIntPipe) rqId: number,
        @Param('role') role: string,
    ): Promise<void> {
        await this.images.remove(rqId, role);
    }
}
