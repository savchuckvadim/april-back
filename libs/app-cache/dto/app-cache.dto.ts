import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsArray,
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Адрес записи кэша: логический ключ `key` в пространстве приложения `app`
 * на портале `domain` (+ опционально пользователь Bitrix).
 * `bxUserId = 0` (по умолчанию) — портальный кэш, общий для всех.
 */
export class AppCacheRefDto {
    @ApiProperty({
        description:
            'Пространство кэша (имя приложения/фичи), напр. sales-finance',
        example: 'sales-finance',
    })
    @IsString()
    @IsNotEmpty()
    app: string;

    @ApiProperty({
        description: 'Домен портала Bitrix24',
        example: 'gsr.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({ description: 'Логический ключ внутри пространства app' })
    @IsString()
    @IsNotEmpty()
    key: string;

    @ApiPropertyOptional({
        description: 'ID пользователя Bitrix; 0/не указан — портальный кэш',
        default: 0,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    bxUserId?: number;
}

export class AppCacheSetRequestDto extends AppCacheRefDto {
    @ApiProperty({
        description: 'Полезная нагрузка — любой сериализуемый JSON',
    })
    @IsNotEmpty()
    data: unknown;

    @ApiPropertyOptional({
        description:
            'TTL в секундах; не указан — бессрочно (в БД без expired_at)',
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    ttlSeconds?: number;

    @ApiPropertyOptional({
        description: 'Группа для пакетного сброса, напр. closed-sales',
    })
    @IsOptional()
    @IsString()
    group?: string;

    @ApiPropertyOptional({
        description: 'Произвольные метаданные записи (не участвуют в выборках)',
    })
    @IsOptional()
    @IsObject()
    meta?: Record<string, unknown>;

    @ApiPropertyOptional({
        description: 'Теги записи для фильтрации в инспекции',
        type: [String],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    tags?: string[];
}

export class AppCacheSetResponseDto {
    @ApiProperty({ description: 'UUID записи в app_cache' })
    id: string;

    @ApiProperty({ description: 'md5-чексумма сериализованных данных' })
    checksum: string;

    @ApiProperty({
        description: 'Когда протухнет; null — бессрочно',
        type: String,
        nullable: true,
    })
    expiredAt: string | null;
}

/** Метаданные записи кэша (без полезной нагрузки — она может быть большой). */
export class AppCacheItemDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    app: string;

    @ApiProperty()
    domain: string;

    @ApiProperty({ description: 'ID портала (portals.id)' })
    portalId: number;

    @ApiProperty({ description: '0 — портальный кэш' })
    bxUserId: number;

    @ApiProperty()
    key: string;

    @ApiProperty({ type: String, nullable: true })
    group: string | null;

    @ApiProperty({ type: String, nullable: true })
    checksum: string | null;

    @ApiProperty({ description: 'Теги записи', type: [String], nullable: true })
    tags: string[] | null;

    @ApiProperty({ type: String, nullable: true })
    expiredAt: string | null;

    @ApiProperty({ description: 'Запись уже протухла (expired_at в прошлом)' })
    isExpired: boolean;

    @ApiProperty({ description: 'Горячая копия сейчас лежит в Redis' })
    inRedis: boolean;

    @ApiProperty({ type: String, nullable: true })
    createdAt: string | null;

    @ApiProperty({ type: String, nullable: true })
    updatedAt: string | null;
}

/** Запись целиком: метаданные + полезная нагрузка + произвольные meta. */
export class AppCacheEntryDto extends AppCacheItemDto {
    @ApiProperty({ description: 'Полезная нагрузка' })
    data: unknown;

    @ApiProperty({
        description: 'Метаданные, сохранённые вместе с записью',
        nullable: true,
    })
    meta: Record<string, unknown> | null;
}

export class AppCacheListRequestDto {
    @ApiPropertyOptional({ description: 'Фильтр по пространству app' })
    @IsOptional()
    @IsString()
    app?: string;

    @ApiPropertyOptional({ description: 'Фильтр по домену портала' })
    @IsOptional()
    @IsString()
    domain?: string;

    @ApiPropertyOptional({ description: 'Фильтр по группе' })
    @IsOptional()
    @IsString()
    group?: string;

    @ApiPropertyOptional({ description: 'Ключ начинается с…' })
    @IsOptional()
    @IsString()
    keyPrefix?: string;

    @ApiPropertyOptional({ description: 'Фильтр по пользователю Bitrix' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    bxUserId?: number;

    @ApiPropertyOptional({
        description: 'Показывать и протухшие записи',
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    includeExpired?: boolean;

    @ApiPropertyOptional({
        default: 50,
        description: 'Размер страницы (максимум 200)',
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    take?: number;

    @ApiPropertyOptional({ default: 0 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    skip?: number;
}

export class AppCacheListResponseDto {
    @ApiProperty({ type: [AppCacheItemDto] })
    items: AppCacheItemDto[];

    @ApiProperty({ description: 'Всего записей под фильтром (без пагинации)' })
    total: number;
}

export class AppCacheEntryRequestDto {
    @ApiPropertyOptional({
        description:
            'UUID записи; либо id, либо адрес app+domain+key(+bxUserId)',
    })
    @IsOptional()
    @IsString()
    id?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    app?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    domain?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    key?: string;

    @ApiPropertyOptional({ default: 0 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    bxUserId?: number;
}

export class AppCacheResetRequestDto {
    @ApiPropertyOptional({
        description: 'Сбросить только это пространство app',
    })
    @IsOptional()
    @IsString()
    app?: string;

    @ApiPropertyOptional({ description: 'Сбросить только этот портал' })
    @IsOptional()
    @IsString()
    domain?: string;

    @ApiPropertyOptional({ description: 'Сбросить только эту группу' })
    @IsOptional()
    @IsString()
    group?: string;

    @ApiPropertyOptional({ description: 'Сбросить ключи, начинающиеся с…' })
    @IsOptional()
    @IsString()
    keyPrefix?: string;
}

export class AppCacheResetResponseDto {
    @ApiProperty({ description: 'Удалено строк в БД' })
    deletedDb: number;

    @ApiProperty({ description: 'Удалено ключей в Redis' })
    deletedRedis: number;
}

export class AppCacheDeleteResponseDto {
    @ApiProperty({ description: 'Запись существовала и удалена' })
    deleted: boolean;
}

export class AppCachePurgeResponseDto {
    @ApiProperty({ description: 'Удалено протухших строк в БД' })
    deleted: number;
}
