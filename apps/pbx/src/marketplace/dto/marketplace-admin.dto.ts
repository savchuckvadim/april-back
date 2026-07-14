import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';

export class RefreshPlacementsDto {
    @ApiPropertyOptional({
        description:
            'member_id портала (приоритетный способ адресации; постоянен, не зависит от домена)',
        example: 'a223c6b3710f85df22e9377d6c4f7553',
        type: String,
    })
    @IsOptional()
    @IsString()
    memberId?: string;

    @ApiPropertyOptional({
        description: 'Домен портала (fallback, если member_id неизвестен)',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsOptional()
    @IsString()
    domain?: string;
}

export class AdminInstallsQueryDto {
    @ApiPropertyOptional({
        description:
            'member_id портала (приоритетный способ адресации; постоянен, не зависит от домена).',
        example: 'a223c6b3710f85df22e9377d6c4f7553',
        type: String,
    })
    @IsOptional()
    @IsString()
    memberId?: string;

    @ApiPropertyOptional({
        description: 'Домен портала (fallback, если member_id неизвестен).',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsOptional()
    @IsString()
    domain?: string;
}

export class AdminInstallComponentDto {
    @ApiProperty({
        description: 'Код продукта компонента (sales/service).',
        example: 'sales',
        type: String,
    })
    productCode: string;

    @ApiProperty({
        description:
            'Тип компонента: placement, smart_scenario или pbx_entities.',
        example: 'placement',
        type: String,
    })
    componentType: string;

    @ApiProperty({
        description: 'Код компонента (например, место встройки:код виджета).',
        example: 'CRM_DEAL_DETAIL_TAB:event-sales',
        type: String,
    })
    componentCode: string;

    @ApiProperty({
        description:
            'Статус компонента: pending/installing/installed/error/unavailable/skipped.',
        example: 'installed',
        type: String,
    })
    status: string;

    @ApiPropertyOptional({
        description: 'Код причины (bitrix_error, stub, unbound и т.п.).',
        example: 'stub',
        type: String,
    })
    reasonCode?: string;

    @ApiPropertyOptional({
        description: 'Текст ошибки компонента.',
        example: 'placement.bind failed',
        type: String,
    })
    errorDetail?: string;

    @ApiProperty({
        description: 'Число попыток установки компонента.',
        example: 1,
        type: Number,
    })
    @IsInt()
    attempts: number;

    @ApiPropertyOptional({
        description: 'Время последней попытки (ISO).',
        example: '2026-07-13T21:44:23.000Z',
        type: String,
    })
    lastAttemptAt?: string;
}

export class AdminInstallDto {
    @ApiProperty({
        description: 'Идентификатор установки (uuid).',
        example: '314bb01a-0e85-47bb-8c82-8d60c2d4c417',
        type: String,
    })
    installId: string;

    @ApiProperty({
        description: 'Код приложения.',
        example: 'garant_manager',
        type: String,
    })
    appCode: string;

    @ApiPropertyOptional({
        description: 'Домен портала на момент установки.',
        example: 'example.bitrix24.ru',
        type: String,
    })
    domain?: string;

    @ApiPropertyOptional({
        description: 'member_id портала.',
        example: 'a223c6b3710f85df22e9377d6c4f7553',
        type: String,
    })
    memberId?: string;

    @ApiPropertyOptional({
        description: 'Язык портала.',
        example: 'ru',
        type: String,
    })
    lang?: string;

    @ApiProperty({
        description:
            'Статус установки: pending/tokens_stored/events_bound/placements_bound/provisioning/installed/error.',
        example: 'installed',
        type: String,
    })
    installStatus: string;

    @ApiPropertyOptional({
        description: 'Шаг, на котором произошла ошибка установки.',
        example: 'events',
        type: String,
    })
    errorStep?: string;

    @ApiPropertyOptional({
        description: 'Текст ошибки установки.',
        example: 'event.bind failed: ...',
        type: String,
    })
    errorDetail?: string;

    @ApiPropertyOptional({
        description: 'Время установки (ISO).',
        example: '2026-07-13T21:44:23.000Z',
        type: String,
    })
    installedAt?: string;

    @ApiPropertyOptional({
        description: 'Время удаления с портала (ISO), если приложение снято.',
        example: null,
        type: String,
        nullable: true,
    })
    uninstalledAt?: string;

    @ApiProperty({
        description: 'Время последнего обновления записи (ISO).',
        example: '2026-07-13T21:44:59.000Z',
        type: String,
    })
    updatedAt: string;

    @ApiPropertyOptional({
        description:
            'Срок жизни access_token (ISO). Сами токены не возвращаются.',
        example: '2026-07-13T22:44:23.000Z',
        type: String,
    })
    tokenExpiresAt?: string;

    @ApiProperty({
        description: 'Сохранён ли access_token.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    hasAccessToken: boolean;

    @ApiProperty({
        description: 'Сохранён ли refresh_token.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    hasRefreshToken: boolean;

    @ApiProperty({
        description: 'Сохранён ли application_token (guard событий).',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    hasApplicationToken: boolean;

    @ApiProperty({
        description: 'По-компонентные статусы установки.',
        type: [AdminInstallComponentDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AdminInstallComponentDto)
    components: AdminInstallComponentDto[];
}

export class PlacementSyncResultDto {
    @ApiProperty({
        description: 'Сколько привязок добавлено (placement.bind)',
        example: 1,
        type: Number,
    })
    @IsInt()
    bound: number;

    @ApiProperty({
        description: 'Сколько привязок снято (placement.unbind)',
        example: 0,
        type: Number,
    })
    @IsInt()
    unbound: number;

    @ApiProperty({
        description: 'Сколько операций завершилось ошибкой',
        example: 0,
        type: Number,
    })
    @IsInt()
    errors: number;

    @ApiProperty({
        description: 'Всего целевых привязок в эталоне (виджет × место)',
        example: 4,
        type: Number,
    })
    @IsInt()
    total: number;
}
