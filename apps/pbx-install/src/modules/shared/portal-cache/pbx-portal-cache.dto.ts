import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString } from 'class-validator';

/** Итог сброса online-кэша портала. */
export class PortalCacheInvalidateResultDto {
    @ApiProperty({
        description: 'Кэш сброшен (Redis недоступен — тоже true, fail-open).',
        type: Boolean,
        example: true,
    })
    @IsBoolean()
    success: boolean;

    @ApiProperty({
        description: 'Домен портала Bitrix.',
        type: String,
        example: 'example.bitrix24.ru',
    })
    @IsString()
    domain: string;

    @ApiProperty({
        description: 'Сброшенный ключ Redis.',
        type: String,
        example: 'portal_example.bitrix24.ru',
    })
    @IsString()
    key: string;
}
