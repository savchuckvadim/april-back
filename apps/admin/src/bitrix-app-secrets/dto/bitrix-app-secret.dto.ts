import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * DTO управления OAuth-кредами приложений Битрикс (bitrix_app_secrets).
 * client_secret в ответах ВСЕГДА маскируется — полное значение
 * возвращается только на запись и никогда не читается обратно.
 */

export class UpsertAppSecretDto {
    @ApiProperty({
        description:
            'client_id приложения из кабинета вендора (поле «Код приложения»)',
        type: String,
        example: 'app.686c1234abcd5.12345678',
    })
    @IsString()
    @MinLength(3)
    @MaxLength(255)
    clientId!: string;

    @ApiProperty({
        description:
            'client_secret приложения из кабинета вендора (поле «Ключ приложения»)',
        type: String,
        example: 'FyX0Zw1abcdEFGH2ijkLMN3opqRST4uv',
    })
    @IsString()
    @MinLength(8)
    @MaxLength(255)
    clientSecret!: string;

    @ApiPropertyOptional({
        description: 'Группа приложения (справочное поле)',
        type: String,
        example: 'marketplace',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    group?: string;

    @ApiPropertyOptional({
        description: 'Тип приложения (справочное поле)',
        type: String,
        example: 'garant',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    type?: string;
}

export class AppSecretDto {
    @ApiProperty({
        description: 'ID записи',
        type: String,
        example: '1',
    })
    id!: string;

    @ApiProperty({
        description: 'Код приложения (ключ поиска, напр. garant_manager)',
        type: String,
        example: 'garant_manager',
    })
    code!: string;

    @ApiProperty({
        description: 'client_id приложения (не секрет — показывается целиком)',
        type: String,
        example: 'app.686c1234abcd5.12345678',
    })
    clientId!: string;

    @ApiProperty({
        description:
            'client_secret МАСКИРОВАННЫЙ (первые и последние 4 символа)',
        type: String,
        example: 'FyX0…4uv1',
    })
    clientSecretMasked!: string;

    @ApiPropertyOptional({
        description: 'Группа приложения',
        type: String,
        example: 'marketplace',
    })
    group?: string;

    @ApiPropertyOptional({
        description: 'Тип приложения',
        type: String,
        example: 'garant',
    })
    type?: string;

    @ApiPropertyOptional({
        description: 'Когда запись обновлялась',
        type: String,
        example: '2026-07-18T12:00:00.000Z',
    })
    updatedAt?: string;
}
