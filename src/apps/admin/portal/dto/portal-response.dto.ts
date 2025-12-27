import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Portal } from 'generated/prisma';

export class PortalResponseDto {
    constructor(portal: Portal) {
        this.id = Number(portal.id);
        this.domain = portal.domain;
        this.key = portal.key;
        this.client_id = portal.client_id ? Number(portal.client_id) : null;
        this.C_REST_CLIENT_ID = portal.C_REST_CLIENT_ID;
        this.C_REST_CLIENT_SECRET = portal.C_REST_CLIENT_SECRET;
        this.C_REST_WEB_HOOK_URL = portal.C_REST_WEB_HOOK_URL;
        this.number = portal.number;
        this.created_at = portal.created_at;
        this.updated_at = portal.updated_at;
    }
    @ApiProperty({
        description: 'Portal ID',
        example: 1,
        type: Number,
    })
    id: number;

    @ApiPropertyOptional({
        description: 'Portal domain',
        example: 'example.bitrix24.ru',
        type: String,
    })
    domain?: string | null;

    @ApiPropertyOptional({
        description: 'Portal key',
        example: 'key123',
        type: String,
    })
    key?: string | null;

    @ApiPropertyOptional({
        description: 'Client ID',
        example: 1,
        type: Number,
    })
    client_id?: number | null;

    @ApiPropertyOptional({
        description: 'C_REST_CLIENT_ID',
        example: 'client_id_123',   
        type: String,
    })
    C_REST_CLIENT_ID?: string | null;

    @ApiPropertyOptional({
        description: 'C_REST_CLIENT_SECRET',
        example: 'client_secret_123',
        type: String,
    })
    C_REST_CLIENT_SECRET?: string | null;

    @ApiPropertyOptional({
        description: 'C_REST_WEB_HOOK_URL',
        example: 'https://example.bitrix24.ru/rest/1/webhook',
        type: String,
    })
    C_REST_WEB_HOOK_URL?: string | null;

    @ApiPropertyOptional({
        description: 'Portal number',
        example: 1,
        type: Number,
    })
    number?: number;

    @ApiPropertyOptional({
        description: 'Created at',
        example: '2024-01-01T00:00:00.000Z',
        type: String,
    })
    created_at?: Date | null;

    @ApiPropertyOptional({
        description: 'Updated at',
        example: '2024-01-01T00:00:00.000Z',
        type: String,
    })
    updated_at?: Date | null;
}

