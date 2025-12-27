import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PortalResponseDto {
    @ApiProperty({
        description: 'Portal ID',
        example: 1,
    })
    id: number;

    @ApiPropertyOptional({
        description: 'Portal domain',
        example: 'example.bitrix24.ru',
    })
    domain?: string | null;

    @ApiPropertyOptional({
        description: 'Portal key',
        example: 'key123',
    })
    key?: string | null;

    @ApiPropertyOptional({
        description: 'Client ID',
        example: 1,
    })
    client_id?: number | null;

    @ApiPropertyOptional({
        description: 'C_REST_CLIENT_ID',
        example: 'client_id_123',
    })
    C_REST_CLIENT_ID?: string | null;

    @ApiPropertyOptional({
        description: 'C_REST_CLIENT_SECRET',
        example: 'client_secret_123',
    })
    C_REST_CLIENT_SECRET?: string | null;

    @ApiPropertyOptional({
        description: 'C_REST_WEB_HOOK_URL',
        example: 'https://example.bitrix24.ru/rest/1/webhook',
    })
    C_REST_WEB_HOOK_URL?: string | null;

    @ApiPropertyOptional({
        description: 'Portal number',
        example: 1,
    })
    number?: number;

    @ApiPropertyOptional({
        description: 'Created at',
        example: '2024-01-01T00:00:00.000Z',
    })
    created_at?: Date | null;

    @ApiPropertyOptional({
        description: 'Updated at',
        example: '2024-01-01T00:00:00.000Z',
    })
    updated_at?: Date | null;
}

