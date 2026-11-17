import {
    ApiProperty,
    ApiPropertyOptional,
    IntersectionType,
} from '@nestjs/swagger';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import {
    SITE_MEDIA_LIBRARY_KINDS,
    SITE_MEDIA_LIBRARY_LIMITS,
    SITE_MEDIA_LIBRARY_PAGE,
    type SiteMediaLibraryKind,
} from '../domain/site-media-library.const';
import {
    SiteMediaTextsDto,
    SiteMediaVideoMetaDto,
} from './site-media-texts.dto';

const LIMITS = SITE_MEDIA_LIBRARY_LIMITS;

/**
 * Строки запроса 'true' / 'false' → boolean. Берём исходное значение из
 * `obj`: при enableImplicitConversion class-transformer сначала приводит
 * значение к Boolean ('false' → true) и только потом зовёт @Transform.
 */
const toBoolean = ({ obj, key }: TransformFnParams): unknown => {
    const raw: unknown = (obj as Record<string, unknown>)[key];
    if (raw === 'true' || raw === true) return true;
    if (raw === 'false' || raw === false) return false;
    return raw;
};

export class SiteMediaLibraryIdParamsDto {
    @ApiProperty({
        description: 'Id медиа в медиатеке (uuid строки site_media).',
        type: String,
        format: 'uuid',
        example: '3f2b8c1e-5d4a-4f6b-9a7c-1e2d3c4b5a69',
    })
    @IsUUID()
    id!: string;
}

export class SiteMediaLibraryListQueryDto {
    @ApiPropertyOptional({
        description:
            'Вид медиа: картинка, ролик на нашем сервере или только внешнее видео. Не задан — все виды.',
        type: String,
        enum: SITE_MEDIA_LIBRARY_KINDS,
        example: 'image',
    })
    @IsOptional()
    @IsString()
    @IsIn(SITE_MEDIA_LIBRARY_KINDS)
    kind?: SiteMediaLibraryKind;

    @ApiPropertyOptional({
        description:
            'true — только медиа, которое не стоит ни в одной статье: его можно удалить.',
        type: Boolean,
        example: false,
    })
    @IsOptional()
    @Transform(toBoolean)
    @IsBoolean()
    unused?: boolean;

    @ApiPropertyOptional({
        description: 'Поиск по служебному названию, подписи и alt.',
        type: String,
        example: 'отчёт KPI',
        maxLength: LIMITS.search,
    })
    @IsOptional()
    @IsString()
    @MaxLength(LIMITS.search)
    search?: string;

    @ApiPropertyOptional({
        description: 'Номер страницы с 1; свежие медиа — первыми.',
        type: Number,
        example: 1,
        minimum: 1,
        default: 1,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @ApiPropertyOptional({
        description: 'Сколько медиа на странице.',
        type: Number,
        example: SITE_MEDIA_LIBRARY_PAGE.defaultSize,
        minimum: 1,
        maximum: SITE_MEDIA_LIBRARY_PAGE.maxSize,
        default: SITE_MEDIA_LIBRARY_PAGE.defaultSize,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(SITE_MEDIA_LIBRARY_PAGE.maxSize)
    pageSize?: number;
}

const EMBED_URL_DESCRIPTION =
    'Ссылка на ролик YouTube, Rutube или VK Видео. В базе хранится поставщик и id ролика: адрес плеера сайт собирает сам, произвольный iframe на страницу не попадает.';

/**
 * Загрузка медиа (multipart/form-data): файлы приходят через multer и
 * проверяются сервисом по содержимому; текстовые части — этим DTO.
 */
export class SiteMediaLibraryUploadDto extends IntersectionType(
    SiteMediaTextsDto,
    SiteMediaVideoMetaDto,
) {
    @ApiProperty({
        description:
            'Файл: картинка PNG, JPG или WebP до 10 МБ либо ролик MP4 (H.264) до 80 МБ. Вид медиа определяется по содержимому файла.',
        type: String,
        format: 'binary',
    })
    file?: Express.Multer.File;

    @ApiPropertyOptional({
        description:
            'Постер ролика — картинка до запуска видео. Только к видео.',
        type: String,
        format: 'binary',
    })
    poster?: Express.Multer.File;

    @ApiPropertyOptional({
        description:
            'Вариант картинки для тёмной темы сайта. Только к картинке; без него одна картинка на обе темы.',
        type: String,
        format: 'binary',
    })
    dark?: Express.Multer.File;

    @ApiPropertyOptional({
        description: `Запасная внешняя ссылка ролика (только у видео): сайт показывает свой файл, ссылку — если файл не играет. ${EMBED_URL_DESCRIPTION}`,
        type: String,
        example: 'https://rutube.ru/video/0123456789abcdef0123456789abcdef/',
        maxLength: LIMITS.embedUrl,
    })
    @IsOptional()
    @IsString()
    @MaxLength(LIMITS.embedUrl)
    embedUrl?: string;
}

export class SiteMediaLibraryEmbedDto extends SiteMediaTextsDto {
    @ApiProperty({
        description: EMBED_URL_DESCRIPTION,
        type: String,
        example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        maxLength: LIMITS.embedUrl,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(LIMITS.embedUrl)
    url!: string;
}

export class SiteMediaLibraryEditDto extends IntersectionType(
    SiteMediaTextsDto,
    SiteMediaVideoMetaDto,
) {
    @ApiPropertyOptional({
        description: `Внешняя ссылка: у внешнего видео — замена ролика, у видео на нашем сервере — запасная ссылка; null или пусто — снять запасную ссылку (у внешнего видео ссылка обязательна). Не передана — без изменений. ${EMBED_URL_DESCRIPTION}`,
        type: String,
        example: 'https://vkvideo.ru/video-22822305_456242110',
        maxLength: LIMITS.embedUrl,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    @MaxLength(LIMITS.embedUrl)
    embedUrl?: string | null;
}

/** Замена файла (multipart/form-data): новый файл того же вида и размеры ролика. */
export class SiteMediaLibraryReplaceDto extends SiteMediaVideoMetaDto {
    @ApiProperty({
        description:
            'Новый файл того же вида: картинку меняют картинкой, ролик — роликом. Постер и тёмный вариант остаются.',
        type: String,
        format: 'binary',
    })
    file?: Express.Multer.File;
}

/** Постер ролика или тёмный вариант картинки (multipart/form-data). */
export class SiteMediaLibraryExtraFileDto {
    @ApiProperty({
        description:
            'Картинка PNG, JPG или WebP до 10 МБ: постер ролика или вариант картинки для тёмной темы.',
        type: String,
        format: 'binary',
    })
    file?: Express.Multer.File;
}
