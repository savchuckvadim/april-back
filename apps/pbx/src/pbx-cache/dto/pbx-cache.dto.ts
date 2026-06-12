import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { PBX_CACHE_ENTITIES, PbxCacheEntity } from '../pbx-cache-entity.enum';

/**
 * Параметр пути с доменом портала и сущностью кэша.
 */
export class PbxCacheParamsDto {
    @ApiProperty({
        description: 'Домен портала Bitrix (используется как часть ключа кэша)',
        type: String,
        example: 'example.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain!: string;

    @ApiProperty({
        description: 'Сущность общих данных портала',
        enum: PBX_CACHE_ENTITIES,
        example: 'portal',
    })
    @IsString()
    @IsNotEmpty()
    entity!: PbxCacheEntity;
}

/**
 * Тело запроса на сохранение значения в кэш.
 */
export class SetPbxCacheDto {
    @ApiProperty({
        description:
            'Произвольное значение сущности (сериализуется в JSON и кладётся в Redis)',
        type: Object,
        example: { id: 1, title: 'Портал клиента' },
    })
    @IsNotEmpty()
    value!: unknown;

    @ApiProperty({
        description:
            'TTL в секундах. Не передавать или 0 — хранить бессрочно (требование pbx-cache)',
        type: Number,
        required: false,
        example: 0,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    ttlSeconds?: number;
}

/**
 * Ответ с кэшированным значением.
 */
export class PbxCacheValueResponseDto {
    @ApiProperty({
        description: 'Домен портала',
        type: String,
        example: 'example.bitrix24.ru',
    })
    domain!: string;

    @ApiProperty({
        description: 'Сущность кэша',
        enum: PBX_CACHE_ENTITIES,
        example: 'portal',
    })
    entity!: PbxCacheEntity;

    @ApiProperty({
        description: 'Найдено ли значение в кэше',
        type: Boolean,
        example: true,
    })
    found!: boolean;

    @ApiProperty({
        description: 'Кэшированное значение или null, если его нет',
        type: Object,
        nullable: true,
        example: { id: 1, title: 'Портал клиента' },
    })
    value!: unknown;
}
