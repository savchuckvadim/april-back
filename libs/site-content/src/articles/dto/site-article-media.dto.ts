import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import { toSiteMediaView } from '../../library/domain/site-media-library.view';
import { SiteMediaLibraryItemDto } from '../../library/dto/site-media-library-view.dto';
import {
    SITE_ARTICLE_LIMITS,
    SITE_ARTICLE_MEDIA_ROLES,
    SITE_ARTICLE_SLOT_MAX_LENGTH,
    type SiteArticleMediaRole,
} from '../domain/site-article.const';
import type { SiteArticleMediaLink } from '../domain/site-article.types';
import type { SiteArticleMediaPutCommand } from '../services/site-article-media.service';
import { SiteArticleIdParamsDto } from './site-article.dto';
import { isoOrNull } from './site-article-view.dto';

/** Галерея больше этого — уже не галерея, а медиатека. */
const GALLERY_MAX = 500;

export class SiteArticleMediaLinkParamsDto extends SiteArticleIdParamsDto {
    @ApiProperty({
        description: 'Id привязки медиа к статье.',
        type: String,
        format: 'uuid',
        example: '5a691e8c-1e3f-4b2b-9a7c-2d3c4b4a5d6f',
    })
    @IsUUID()
    linkId!: string;
}

export class SiteArticleMediaPutDto implements SiteArticleMediaPutCommand {
    @ApiProperty({
        description:
            'Роль медиа: cover — обложка (только картинка), inline — место в тексте (id блока), gallery — галерея в конце статьи.',
        type: String,
        enum: SITE_ARTICLE_MEDIA_ROLES,
        example: 'inline',
    })
    @IsString()
    @IsIn(SITE_ARTICLE_MEDIA_ROLES)
    role!: SiteArticleMediaRole;

    @ApiPropertyOptional({
        description:
            'Место в тексте — id блока-скрина или блока media (латиница, цифры, дефисы, до 64 знаков). Нужно только для inline; у обложки место всегда cover, у галереи места нет.',
        type: String,
        example: 'scr-kpi-pulse',
        maxLength: SITE_ARTICLE_SLOT_MAX_LENGTH,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    @MaxLength(SITE_ARTICLE_SLOT_MAX_LENGTH)
    slot?: string | null;

    @ApiProperty({
        description: 'Id медиа из медиатеки.',
        type: String,
        format: 'uuid',
        example: '3f2b8c1e-5d4a-4f6b-9a7c-1e2d3c4b5a69',
    })
    @IsUUID()
    mediaId!: string;

    @ApiPropertyOptional({
        description:
            'Подпись в этой статье; пусто — подпись медиа по умолчанию.',
        type: String,
        example: 'Пульс отдела за неделю',
        maxLength: SITE_ARTICLE_LIMITS.caption,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    @MaxLength(SITE_ARTICLE_LIMITS.caption)
    caption?: string | null;

    @ApiPropertyOptional({
        description:
            'Порядок; не передан — у галереи в конец, у прочих — без изменений.',
        type: Number,
        example: 10,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(-1_000_000)
    @Max(1_000_000)
    sort?: number;
}

export class SiteArticleGalleryOrderDto {
    @ApiProperty({
        description:
            'Все привязки галереи статьи в новом порядке. Если галерею за это время изменили — 409.',
        type: [String],
        example: ['5a691e8c-1e3f-4b2b-9a7c-2d3c4b4a5d6f'],
        maxItems: GALLERY_MAX,
    })
    @IsArray()
    @ArrayMaxSize(GALLERY_MAX)
    @IsUUID('all', { each: true })
    linkIds!: string[];
}

export class SiteArticleMediaLinkDto
    implements Omit<SiteArticleMediaLink, 'createdAt' | 'updatedAt' | 'media'>
{
    @ApiProperty({
        description: 'Id привязки.',
        type: String,
        format: 'uuid',
        example: '5a691e8c-1e3f-4b2b-9a7c-2d3c4b4a5d6f',
    })
    id!: string;

    @ApiProperty({
        description: 'Id статьи.',
        type: String,
        format: 'uuid',
        example: '8c1e3f2b-4a5d-4f6b-9a7c-2d3c4b5a691e',
    })
    articleId!: string;

    @ApiProperty({
        description: 'Id медиа.',
        type: String,
        format: 'uuid',
        example: '3f2b8c1e-5d4a-4f6b-9a7c-1e2d3c4b5a69',
    })
    mediaId!: string;

    @ApiProperty({
        description: 'Роль медиа в статье.',
        type: String,
        enum: SITE_ARTICLE_MEDIA_ROLES,
        example: 'inline',
    })
    role!: SiteArticleMediaRole;

    @ApiProperty({
        description:
            'Место: у inline — id блока, у обложки — cover, у галереи — null.',
        type: String,
        example: 'scr-kpi-pulse',
        nullable: true,
    })
    slot!: string | null;

    @ApiProperty({
        description: 'Порядок (у галереи — порядок показа).',
        type: Number,
        example: 10,
    })
    sort!: number;

    @ApiProperty({
        description:
            'Подпись в этой статье; null — подпись медиа по умолчанию.',
        type: String,
        example: 'Пульс отдела',
        nullable: true,
    })
    caption!: string | null;

    @ApiProperty({
        description: 'Кто привязал (логин).',
        type: String,
        example: 'admin',
        nullable: true,
    })
    createdBy!: string | null;

    @ApiProperty({
        description: 'Когда привязано (ISO 8601).',
        type: String,
        format: 'date-time',
        example: '2026-11-18T10:00:00.000Z',
        nullable: true,
    })
    createdAt!: string | null;

    @ApiProperty({
        description: 'Когда меняли последний раз (ISO 8601).',
        type: String,
        format: 'date-time',
        example: '2026-11-18T10:00:00.000Z',
        nullable: true,
    })
    updatedAt!: string | null;

    @ApiProperty({
        description: 'Само медиа из медиатеки.',
        type: SiteMediaLibraryItemDto,
    })
    media!: SiteMediaLibraryItemDto;

    static from(link: SiteArticleMediaLink): SiteArticleMediaLinkDto {
        return {
            ...link,
            createdAt: isoOrNull(link.createdAt),
            updatedAt: isoOrNull(link.updatedAt),
            media: SiteMediaLibraryItemDto.from(toSiteMediaView(link.media)),
        };
    }
}

export class SiteArticleMediaLinkListDto {
    @ApiProperty({
        description:
            'Привязки медиа статьи: обложка, места, галерея по порядку.',
        type: [SiteArticleMediaLinkDto],
    })
    items!: SiteArticleMediaLinkDto[];

    static of(
        links: readonly SiteArticleMediaLink[],
    ): SiteArticleMediaLinkListDto {
        return { items: links.map(link => SiteArticleMediaLinkDto.from(link)) };
    }
}

export class SiteArticleMediaUnlinkedDto {
    @ApiProperty({
        description: 'Медиа отвязано от статьи; в медиатеке оно остаётся.',
        type: Boolean,
        example: true,
    })
    deleted!: boolean;
}
