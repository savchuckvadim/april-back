import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClientResponseDto {
    @ApiProperty({
        description: 'Client ID',
        example: 1,
    })
    id: number;

    @ApiProperty({
        description: 'Client name',
        example: 'Acme Corp',
    })
    name: string;

    @ApiPropertyOptional({
        description: 'Client email',
        example: 'contact@acme.com',
    })
    email?: string | null;

    @ApiPropertyOptional({
        description: 'Client status',
        example: 'active',
    })
    status?: string | null;

    @ApiPropertyOptional({
        description: 'Client is active',
        example: true,
    })
    is_active?: boolean | null;

    @ApiPropertyOptional({
        description: 'Client created at',
        example: '2024-01-01T00:00:00.000Z',
    })
    created_at?: Date | null;

    @ApiPropertyOptional({
        description: 'Client updated at',
        example: '2024-01-01T00:00:00.000Z',
    })
    updated_at?: Date | null;
}

