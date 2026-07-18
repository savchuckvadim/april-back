import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import { InstallComponentDto } from './marketplace-moderation.dto';

/**
 * DTO обзорных разделов маркетплейс-админки: установки (marketplace_installs),
 * журнал событий (bitrix_app_events), продукты портала (portal_products).
 * Только чтение; токены доступа наружу не отдаются — лишь диагностика наличия.
 */

export class InstallsQueryDto {
    @ApiPropertyOptional({
        description: 'Фильтр по домену портала (частичное совпадение)',
        type: String,
        example: 'april-dev',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    domain?: string;

    @ApiPropertyOptional({
        description: 'Фильтр по member_id портала (точное совпадение)',
        type: String,
        example: '30aedf93f9c0e53a21143710eba8d95f',
    })
    @IsOptional()
    @IsString()
    @MaxLength(64)
    memberId?: string;

    @ApiPropertyOptional({
        description:
            'Фильтр по статусу установки (pending | tokens_stored | events_bound | placements_bound | provisioning | installed | error)',
        type: String,
        example: 'installed',
    })
    @IsOptional()
    @IsString()
    @MaxLength(32)
    installStatus?: string;
}

export class AdminMarketplaceInstallDto {
    @ApiProperty({
        description: 'ID установки (marketplace_installs.id, uuid)',
        type: String,
        example: '314bb01a-0e85-47bb-8c82-8d60c2d4c417',
    })
    installId!: string;

    @ApiProperty({
        description: 'ID портала (portals.id)',
        type: String,
        example: '7',
    })
    portalId!: string;

    @ApiPropertyOptional({
        description: 'Домен портала',
        type: String,
        example: 'april-dev.bitrix24.ru',
    })
    domain?: string;

    @ApiPropertyOptional({
        description: 'member_id портала',
        type: String,
        example: '30aedf93f9c0e53a21143710eba8d95f',
    })
    memberId?: string;

    @ApiPropertyOptional({
        description: 'Статус допуска портала (pending | approved | blocked)',
        type: String,
        example: 'approved',
    })
    approvalStatus?: string;

    @ApiProperty({
        description: 'Код приложения',
        type: String,
        example: 'garant_manager',
    })
    appCode!: string;

    @ApiProperty({
        description: 'Статус установки (state machine install_status)',
        type: String,
        example: 'installed',
    })
    installStatus!: string;

    @ApiPropertyOptional({
        description: 'Шаг, на котором произошла ошибка установки',
        type: String,
        example: 'placements',
    })
    errorStep?: string;

    @ApiPropertyOptional({
        description: 'Детали ошибки установки',
        type: String,
        example: 'placement.bind failed: ERROR_CORE',
    })
    errorDetail?: string;

    @ApiPropertyOptional({
        description: 'Версия приложения (из ONAPPUPDATE)',
        type: String,
        example: '1',
    })
    version?: string;

    @ApiPropertyOptional({
        description: 'Когда установлено',
        type: String,
        example: '2026-07-18T06:00:19.000Z',
    })
    installedAt?: string;

    @ApiPropertyOptional({
        description: 'Когда удалено (ONAPPUNINSTALL); null = активна',
        type: String,
        example: '2026-07-18T05:59:35.000Z',
    })
    uninstalledAt?: string;

    @ApiPropertyOptional({
        description: 'Срок жизни access_token (диагностика «спящих» порталов)',
        type: String,
        example: '2026-07-18T07:00:19.000Z',
    })
    tokenExpiresAt?: string;

    @ApiProperty({
        description: 'Есть ли refresh_token (возможен фоновый рефреш)',
        type: Boolean,
        example: true,
    })
    hasRefreshToken!: boolean;

    @ApiProperty({
        description: 'Количество компонент-статусов установки',
        type: Number,
        example: 21,
    })
    componentsCount!: number;
}

export class AdminMarketplaceInstallDetailsDto extends AdminMarketplaceInstallDto {
    @ApiProperty({
        description: 'Компоненты установки (по осям, со статусами)',
        type: InstallComponentDto,
        isArray: true,
    })
    components!: InstallComponentDto[];
}

export class EventsQueryDto {
    @ApiPropertyOptional({
        description: 'Фильтр по member_id портала',
        type: String,
        example: '30aedf93f9c0e53a21143710eba8d95f',
    })
    @IsOptional()
    @IsString()
    @MaxLength(64)
    memberId?: string;

    @ApiPropertyOptional({
        description: 'Фильтр по домену портала (частичное совпадение)',
        type: String,
        example: 'april-dev',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    domain?: string;

    @ApiPropertyOptional({
        description:
            'Фильтр по событию (INSTALL_CALLBACK, ONAPPUNINSTALL, ONBOARDING_APPLICATION, MODERATION_APPROVE, TOKEN_REFRESH …)',
        type: String,
        example: 'ONBOARDING_APPLICATION',
    })
    @IsOptional()
    @IsString()
    @MaxLength(64)
    event?: string;

    @ApiPropertyOptional({
        description:
            'Фильтр по статусу обработки (received | processed | error)',
        type: String,
        example: 'error',
    })
    @IsOptional()
    @IsString()
    @MaxLength(32)
    status?: string;

    @ApiPropertyOptional({
        description: 'Сколько записей вернуть (1–100, по умолчанию 50)',
        type: Number,
        example: 50,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    take?: number;

    @ApiPropertyOptional({
        description: 'Сколько записей пропустить (пагинация)',
        type: Number,
        example: 0,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    skip?: number;
}

export class AppEventDto {
    @ApiProperty({
        description: 'ID записи журнала (uuid)',
        type: String,
        example: 'f2b7c1d0-3c4a-4e0e-9b1a-2f6d8a9c0e11',
    })
    id!: string;

    @ApiPropertyOptional({
        description: 'member_id портала',
        type: String,
        example: '30aedf93f9c0e53a21143710eba8d95f',
    })
    memberId?: string;

    @ApiPropertyOptional({
        description: 'Домен портала',
        type: String,
        example: 'april-dev.bitrix24.ru',
    })
    domain?: string;

    @ApiProperty({
        description: 'Событие',
        type: String,
        example: 'ONBOARDING_APPLICATION',
    })
    event!: string;

    @ApiProperty({
        description: 'Статус обработки (received | processed | error)',
        type: String,
        example: 'processed',
    })
    status!: string;

    @ApiPropertyOptional({
        description: 'Payload события (токены замаскированы при записи)',
        type: String,
        example: '{"organizationName":"ООО «Ромашка»"}',
    })
    payload?: string;

    @ApiPropertyOptional({
        description: 'Детали ошибки обработки',
        type: String,
        example: 'application_token mismatch',
    })
    errorDetail?: string;

    @ApiPropertyOptional({
        description: 'Когда произошло',
        type: String,
        example: '2026-07-18T06:00:19.000Z',
    })
    createdAt?: string;
}

export class AppEventsPageDto {
    @ApiProperty({
        description: 'Записи журнала (новые сверху)',
        type: AppEventDto,
        isArray: true,
    })
    items!: AppEventDto[];

    @ApiProperty({
        description: 'Всего записей под фильтром (для пагинации)',
        type: Number,
        example: 1234,
    })
    total!: number;
}

export class PortalProductDto {
    @ApiProperty({
        description: 'Код продукта (sales | service)',
        type: String,
        example: 'sales',
    })
    code!: string;

    @ApiProperty({
        description: 'Статус продукта (active | inactive | suspended)',
        type: String,
        example: 'active',
    })
    status!: string;

    @ApiPropertyOptional({
        description: 'Когда активирован',
        type: String,
        example: '2026-07-18T10:00:00.000Z',
    })
    activatedAt?: string;

    @ApiPropertyOptional({
        description: 'Оплачен до (задел под этап оплат)',
        type: String,
        example: '2027-07-18T00:00:00.000Z',
    })
    paidUntil?: string;
}

export class PbxActionResultDto {
    @ApiProperty({
        description:
            'Действие принято pbx (задача поставлена/синхронизация выполнена)',
        type: Boolean,
        example: true,
    })
    ok!: boolean;

    @ApiPropertyOptional({
        description:
            'Сырые детали ответа pbx (jobId, счётчики bound/unbound и т.п.)',
        type: String,
        example: '{"provisionJobId":"mp-provision:member-1:sales"}',
    })
    details?: string;
}
