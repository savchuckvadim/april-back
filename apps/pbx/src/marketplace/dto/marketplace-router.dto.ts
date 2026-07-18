import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
    MARKETPLACE_INSTALL_STATUSES,
    MarketplaceInstallStatus,
} from './marketplace-install.dto';

export class MarketplaceRouteResultDto {
    @ApiProperty({
        description: 'Статус сохранения токенов открытия',
        example: 'success',
        enum: MARKETPLACE_INSTALL_STATUSES,
    })
    @IsEnum(MARKETPLACE_INSTALL_STATUSES)
    status: MarketplaceInstallStatus;

    @ApiProperty({
        description: 'URL фронта, на который выполняется redirect',
        example:
            'https://bitrix.april-app.ru/cabinet?domain=example.bitrix24.ru',
        type: String,
    })
    @IsString()
    redirectUrl: string;

    @ApiPropertyOptional({
        description: 'Домен портала Bitrix24',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsOptional()
    @IsString()
    domain?: string;

    @ApiPropertyOptional({
        description: 'member_id портала',
        example: 'a223c6b3710f85df22e9377d6c4f7553',
        type: String,
    })
    @IsOptional()
    @IsString()
    memberId?: string;

    @ApiPropertyOptional({
        description: 'Код места встройки (PLACEMENT)',
        example: 'CRM_DEAL_DETAIL_TAB',
        type: String,
    })
    @IsOptional()
    @IsString()
    placement?: string;

    @ApiPropertyOptional({
        description:
            'Состояние допуска портала (onboarding | pending | active | blocked | unauthorized) — уходит фронту в query',
        example: 'active',
        type: String,
    })
    @IsOptional()
    @IsString()
    state?: string;

    @ApiPropertyOptional({
        description:
            'HTML-заглушка «приложение пока не готово»: если задана — контроллер отдаёт её (200) ВМЕСТО redirect (readiness-гейт виджетов)',
        type: String,
    })
    @IsOptional()
    @IsString()
    stubHtml?: string;
}

export const MARKETPLACE_EVENT_STATUSES = [
    'processed',
    'rejected',
    'ignored',
    'error',
] as const;

export class MarketplaceEventResultDto {
    @ApiProperty({
        description: 'Результат обработки события жизненного цикла',
        example: 'processed',
        enum: MARKETPLACE_EVENT_STATUSES,
    })
    @IsEnum(MARKETPLACE_EVENT_STATUSES)
    status: (typeof MARKETPLACE_EVENT_STATUSES)[number];

    @ApiPropertyOptional({
        description: 'Имя события',
        example: 'ONAPPUNINSTALL',
        type: String,
    })
    @IsOptional()
    @IsString()
    event?: string;

    @ApiPropertyOptional({
        description: 'Сообщение (причина reject/error)',
        example: 'application_token не совпадает',
        type: String,
    })
    @IsOptional()
    @IsString()
    message?: string;
}

export class MarketplaceHookResultDto {
    @ApiProperty({
        description: 'Статус приёма хука',
        example: 'ok',
        enum: ['ok'],
    })
    @IsString()
    status: 'ok';

    @ApiProperty({
        description: 'Код хука',
        example: 'kpi-list-sync',
        type: String,
    })
    @IsString()
    code: string;
}
