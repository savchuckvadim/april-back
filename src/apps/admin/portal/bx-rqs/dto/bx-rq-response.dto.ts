import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BxRqResponseDto {
    @ApiProperty({
        description: 'RQ ID',
        example: 1,
    })
    id: number;

    @ApiPropertyOptional({
        description: 'Portal ID',
        example: 1,
    })
    portal_id?: number | null;

    @ApiPropertyOptional({
        description: 'RQ name',
        example: 'RQ Name',
    })
    name?: string | null;

    @ApiPropertyOptional({
        description: 'RQ code',
        example: 'RQ_CODE',
    })
    code?: string | null;

    @ApiPropertyOptional({
        description: 'RQ type',
        example: 'type',
    })
    type?: string | null;

    @ApiPropertyOptional({
        description: 'Bitrix ID',
        example: 'bitrix_id_123',
    })
    bitrix_id?: string | null;

    @ApiPropertyOptional({
        description: 'XML ID',
        example: 'xml_id_123',
    })
    xml_id?: string | null;

    @ApiPropertyOptional({
        description: 'Entity Type ID',
        example: '134',
    })
    entity_type_id?: string | null;

    @ApiPropertyOptional({
        description: 'Country ID',
        example: '1',
    })
    country_id?: string | null;

    @ApiPropertyOptional({
        description: 'Is active',
        example: true,
    })
    is_active?: boolean;

    @ApiPropertyOptional({
        description: 'Sort order',
        example: 1,
    })
    sort?: number | null;

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

