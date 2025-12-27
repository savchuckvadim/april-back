import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SmartResponseDto {
    @ApiProperty({
        description: 'Smart ID',
        example: 1,
    })
    id: number;

    @ApiProperty({
        description: 'Smart type',
        example: 'type',
    })
    type: string;

    @ApiProperty({
        description: 'Smart group',
        example: 'group',
    })
    group: string;

    @ApiProperty({
        description: 'Smart name',
        example: 'Smart Name',
    })
    name: string;

    @ApiProperty({
        description: 'Smart title',
        example: 'Smart Title',
    })
    title: string;

    @ApiProperty({
        description: 'Entity Type ID',
        example: 134,
    })
    entityTypeId: number;

    @ApiProperty({
        description: 'Portal ID',
        example: 1,
    })
    portal_id: number;

    @ApiPropertyOptional({
        description: 'Bitrix ID',
        example: 123,
    })
    bitrixId?: number | null;

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
        description: 'For Stage',
        example: 'DT134_',
    })
    forStage?: string | null;

    @ApiPropertyOptional({
        description: 'For Filter',
        example: 'DYNAMIC_134_',
    })
    forFilter?: string | null;

    @ApiPropertyOptional({
        description: 'CRM',
        example: 'T9c_',
    })
    crm?: string | null;

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

