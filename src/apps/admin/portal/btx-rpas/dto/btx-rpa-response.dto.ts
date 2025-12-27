import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BtxRpaResponseDto {
    @ApiProperty({
        description: 'RPA ID',
        example: 1,
    })
    id: number;

    @ApiProperty({
        description: 'RPA name',
        example: 'RPA Name',
    })
    name: string;

    @ApiProperty({
        description: 'RPA title',
        example: 'RPA Title',
    })
    title: string;

    @ApiProperty({
        description: 'RPA code',
        example: 'RPA_CODE',
    })
    code: string;

    @ApiProperty({
        description: 'RPA type',
        example: 'type',
    })
    type: string;

    @ApiProperty({
        description: 'Type ID',
        example: 'typeId',
    })
    typeId: string;

    @ApiProperty({
        description: 'Portal ID',
        example: 1,
    })
    portal_id: number;

    @ApiPropertyOptional({
        description: 'Image',
        example: 'image.png',
    })
    image?: string | null;

    @ApiPropertyOptional({
        description: 'Bitrix ID',
        example: 123,
    })
    bitrixId?: number | null;

    @ApiPropertyOptional({
        description: 'Description',
        example: 'Description text',
    })
    description?: string | null;

    @ApiPropertyOptional({
        description: 'Entity Type ID',
        example: 134,
    })
    entityTypeId?: number | null;

    @ApiPropertyOptional({
        description: 'For Stage ID',
        example: 1,
    })
    forStageId?: number | null;

    @ApiPropertyOptional({
        description: 'For Filter ID',
        example: 1,
    })
    forFilterId?: number | null;

    @ApiPropertyOptional({
        description: 'CRM ID',
        example: 1,
    })
    crmId?: number | null;

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

