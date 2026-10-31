import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import { EPublicLinkStatus } from '../lib/public-link-status.util';

/** Самый долгий срок ссылки с датой окончания: дальше честнее выбрать «до отзыва». */
export const PUBLIC_LINK_MAX_DAYS = 3650;

export class CreatePublicLinkDto {
    @ApiProperty({
        description: 'Портал, чей каталог показывает ссылка',
        type: Number,
        example: 12,
    })
    @IsInt()
    @Min(1)
    portalId: number;

    @ApiProperty({
        description: 'Название ссылки: кому и зачем выдана',
        type: String,
        example: 'Новые сотрудники, ноябрь',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    title: string;

    @ApiPropertyOptional({
        description: 'Срок действия в днях. Не указан — действует до отзыва',
        type: Number,
        example: 30,
        minimum: 1,
        maximum: PUBLIC_LINK_MAX_DAYS,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(PUBLIC_LINK_MAX_DAYS)
    expiresInDays?: number;
}

export class PublicLinkDto {
    @ApiProperty({ description: 'Идентификатор ссылки', type: String })
    id: string;

    @ApiProperty({ description: 'Токен: последняя часть адреса', type: String })
    token: string;

    @ApiProperty({ description: 'Портал каталога', type: Number })
    portalId: number;

    @ApiProperty({
        description: 'Домен портала каталога (только для админки)',
        type: String,
    })
    domain: string;

    @ApiProperty({ description: 'Название ссылки', type: String })
    title: string;

    @ApiProperty({
        description: 'Состояние ссылки',
        enum: EPublicLinkStatus,
        enumName: 'EPublicLinkStatus',
    })
    status: EPublicLinkStatus;

    @ApiProperty({
        description: 'Когда истекает. Пусто — действует до отзыва',
        type: String,
        format: 'date-time',
        nullable: true,
    })
    expiresAt: string | null;

    @ApiProperty({
        description: 'Когда отозвана',
        type: String,
        format: 'date-time',
        nullable: true,
    })
    revokedAt: string | null;

    @ApiProperty({
        description: 'Сколько раз открывали каталог по ссылке',
        type: Number,
    })
    viewCount: number;

    @ApiProperty({
        description: 'Когда открывали в последний раз',
        type: String,
        format: 'date-time',
        nullable: true,
    })
    lastViewedAt: string | null;

    @ApiProperty({
        description: 'Когда создана',
        type: String,
        format: 'date-time',
        nullable: true,
    })
    createdAt: string | null;
}

export class RevokeAllPublicLinksResponseDto {
    @ApiProperty({
        description: 'Сколько действующих ссылок отозвано',
        type: Number,
    })
    revoked: number;
}

/** Что публичная страница знает о своей ссылке. Название ссылки служебное, его здесь нет. */
export class PublicLinkMetaDto {
    @ApiProperty({
        description: 'Когда истекает. Пусто — действует до отзыва',
        type: String,
        format: 'date-time',
        nullable: true,
    })
    expiresAt: string | null;
}
