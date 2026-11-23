import { ApiProperty } from '@nestjs/swagger';
import {
    PROVIDER_IMAGE_FORMATS,
    PROVIDER_IMAGE_ROLES,
    ProviderImageEntity,
    ProviderImageFormat,
    ProviderImageRole,
} from '../provider-image';

/**
 * Картинка реквизитов поставщика в админке: роль, формат, размеры и когда
 * загружена. Путь файла на сервере наружу не отдаётся.
 */
export class ProviderImageResponseDto {
    @ApiProperty({
        description:
            'Id записи (uuid); он же имя файла на сервере. При замене картинки меняется.',
        type: String,
        format: 'uuid',
        example: '3f2a9c1e-7b4d-4e8a-9f60-1c2d3e4f5a6b',
    })
    id: string;

    @ApiProperty({
        description:
            'Реквизиты поставщика (`rqs.id`), которым принадлежит картинка.',
        type: Number,
        example: 12,
    })
    rqId: number;

    @ApiProperty({
        description:
            'Роль картинки: stamp — печать, signature_director — подпись руководителя, signature_accountant — подпись главного бухгалтера, logo — логотип. У реквизитов по одной картинке каждой роли.',
        enum: PROVIDER_IMAGE_ROLES,
        enumName: 'ProviderImageRole',
        example: 'stamp',
    })
    role: ProviderImageRole;

    @ApiProperty({
        description:
            'Формат файла; определён по содержимому при загрузке и после перекодирования остаётся прежним.',
        enum: PROVIDER_IMAGE_FORMATS,
        enumName: 'ProviderImageFormat',
        example: 'png',
    })
    format: ProviderImageFormat;

    @ApiProperty({
        description: 'Ширина в пикселях перекодированного файла.',
        type: Number,
        example: 400,
    })
    width: number;

    @ApiProperty({
        description: 'Высота в пикселях перекодированного файла.',
        type: Number,
        example: 400,
    })
    height: number;

    @ApiProperty({
        description:
            'Размер перекодированного файла в байтах: он может отличаться от размера загруженного.',
        type: Number,
        example: 48213,
    })
    size: number;

    @ApiProperty({
        description:
            'Имя файла, с которым картинку загрузили; только для показа в админке.',
        type: String,
        nullable: true,
        example: 'pechat.png',
    })
    originalName: string | null;

    @ApiProperty({
        description: 'Когда запись создана (ISO 8601).',
        type: String,
        format: 'date-time',
        nullable: true,
        example: '2026-11-23T10:15:00.000Z',
    })
    createdAt: string | null;

    @ApiProperty({
        description:
            'Когда картинку загрузили или заменили последний раз (ISO 8601).',
        type: String,
        format: 'date-time',
        nullable: true,
        example: '2026-11-23T10:15:00.000Z',
    })
    updatedAt: string | null;

    static from(image: ProviderImageEntity): ProviderImageResponseDto {
        return {
            id: image.id,
            rqId: image.rqId,
            role: image.role,
            format: image.format,
            width: image.width,
            height: image.height,
            size: image.size,
            originalName: image.originalName,
            createdAt: image.createdAt?.toISOString() ?? null,
            updatedAt: image.updatedAt?.toISOString() ?? null,
        };
    }
}

/**
 * Тело загрузки картинки (multipart/form-data). Файл разбирает multer, а
 * сервис проверяет его по содержимому: формат по первым байтам, размер и
 * пиксели; class-validator к бинарной части не применим.
 */
export class ProviderImageUploadDto {
    @ApiProperty({
        description:
            'Картинка PNG или JPG до 2 МБ. Формат определяется по содержимому, расширение имени не учитывается. Перед записью картинка перекодируется в простой вид (PNG 8 бит RGBA без чересстрочности, JPEG sRGB не прогрессивный). Прежняя картинка этой роли заменяется.',
        type: String,
        format: 'binary',
    })
    file: Express.Multer.File;
}
