import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { InstallChannel } from '../lib/parse-install-params.util';

export const MARKETPLACE_INSTALL_STATUSES = ['success', 'fail'] as const;
export type MarketplaceInstallStatus =
    (typeof MARKETPLACE_INSTALL_STATUSES)[number];

export class MarketplaceInstallResultDto {
    @ApiProperty({
        description: 'Статус сохранения установки',
        example: 'success',
        enum: MARKETPLACE_INSTALL_STATUSES,
    })
    @IsEnum(MARKETPLACE_INSTALL_STATUSES)
    status: MarketplaceInstallStatus;

    @ApiProperty({
        description: 'Канал, по которому пришла установка',
        example: InstallChannel.EVENT,
        enum: InstallChannel,
    })
    @IsEnum(InstallChannel)
    channel: InstallChannel;

    @ApiPropertyOptional({
        description: 'Домен портала Bitrix24',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsOptional()
    @IsString()
    domain?: string;

    @ApiPropertyOptional({
        description:
            'member_id портала (постоянный идентификатор, не зависит от домена)',
        example: 'a223c6b3710f85df22e9377d6c4f7553',
        type: String,
    })
    @IsOptional()
    @IsString()
    memberId?: string;

    @ApiPropertyOptional({
        description: 'ID записи приложения в БД (bitrix_apps)',
        example: '1',
        type: String,
    })
    @IsOptional()
    @IsString()
    appId?: string;

    @ApiPropertyOptional({
        description: 'Причина отказа (при status=fail)',
        example: 'Не хватает токенов в запросе установки',
        type: String,
    })
    @IsOptional()
    @IsString()
    message?: string;
}
