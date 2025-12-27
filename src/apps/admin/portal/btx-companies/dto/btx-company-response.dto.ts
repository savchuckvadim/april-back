import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BtxCompanyResponseDto {
    @ApiProperty({
        description: 'Company ID',
        example: 1,
    })
    id: number;

    @ApiProperty({
        description: 'Company name',
        example: 'Company Name',
    })
    name: string;

    @ApiProperty({
        description: 'Company title',
        example: 'Company Title',
    })
    title: string;

    @ApiProperty({
        description: 'Company code',
        example: 'COMPANY_CODE',
    })
    code: string;

    @ApiProperty({
        description: 'Portal ID',
        example: 1,
    })
    portal_id: number;

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

