import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';

export class UpdatePortalDto {
    @ApiPropertyOptional({
        description: 'Portal domain',
        example: 'example.bitrix24.ru',
    })
    @IsString()
    @IsOptional()
    domain?: string;

    @ApiPropertyOptional({
        description: 'Portal key',
        example: 'key123',
    })
    @IsString()
    @IsOptional()
    key?: string;

    @ApiPropertyOptional({
        description: 'Client ID',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    client_id?: number;

    @ApiPropertyOptional({
        description: 'C_REST_CLIENT_ID',
        example: 'client_id_123',
    })
    @IsString()
    @IsOptional()
    C_REST_CLIENT_ID?: string;

    @ApiPropertyOptional({
        description: 'C_REST_CLIENT_SECRET',
        example: 'client_secret_123',
    })
    @IsString()
    @IsOptional()
    C_REST_CLIENT_SECRET?: string;

    @ApiPropertyOptional({
        description: 'C_REST_WEB_HOOK_URL',
        example: 'https://example.bitrix24.ru/rest/1/webhook',
    })
    @IsString()
    @IsOptional()
    C_REST_WEB_HOOK_URL?: string;

    @ApiPropertyOptional({
        description: 'Portal number',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    number?: number;
}

