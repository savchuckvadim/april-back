import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import { SITE_MEDIA_LIBRARY_LIMITS } from '../domain/site-media-library.const';
import type {
    SiteMediaTexts,
    SiteMediaVideoMeta,
} from '../domain/site-media-library.types';

const LIMITS = SITE_MEDIA_LIBRARY_LIMITS;

/** Подписи медиа — общее у загрузки, внешнего видео и правки. */
export class SiteMediaTextsDto implements SiteMediaTexts {
    @ApiPropertyOptional({
        description:
            'Служебное название в медиатеке, чтобы найти медиа; посетители сайта его не видят. Пусто или null — без названия.',
        type: String,
        example: 'Пульс отдела — отчёт KPI',
        maxLength: LIMITS.title,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    @MaxLength(LIMITS.title)
    title?: string | null;

    @ApiPropertyOptional({
        description:
            'Подпись под кадром по умолчанию; статья может поставить свою. Пусто или null — без подписи.',
        type: String,
        example: 'Пульс отдела: звонки и встречи за неделю',
        maxLength: LIMITS.caption,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    @MaxLength(LIMITS.caption)
    caption?: string | null;

    @ApiPropertyOptional({
        description:
            'Текст вместо картинки — для незрячих и поисковиков: что изображено. Пусто или null — нет.',
        type: String,
        example: 'Таблица звонков менеджеров отдела продаж за неделю',
        maxLength: LIMITS.alt,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    @MaxLength(LIMITS.alt)
    alt?: string | null;
}

/** Размеры ролика: читает браузер админки из <video>, сервер проверяет диапазоны. */
export class SiteMediaVideoMetaDto implements SiteMediaVideoMeta {
    @ApiPropertyOptional({
        description:
            'Ширина ролика в точках — только у видео (у картинки её читает сервер).',
        type: Number,
        example: 1920,
        minimum: 1,
        maximum: LIMITS.side,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(LIMITS.side)
    width?: number;

    @ApiPropertyOptional({
        description: 'Высота ролика в точках — только у видео.',
        type: Number,
        example: 1080,
        minimum: 1,
        maximum: LIMITS.side,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(LIMITS.side)
    height?: number;

    @ApiPropertyOptional({
        description: 'Длительность ролика в секундах — только у видео.',
        type: Number,
        example: 95,
        minimum: 0,
        maximum: LIMITS.durationSec,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @Max(LIMITS.durationSec)
    durationSec?: number;
}
