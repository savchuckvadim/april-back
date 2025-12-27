import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BtxContactResponseDto {
    @ApiProperty({
        description: 'Contact ID',
        example: 1,
    })
    id: number;

    @ApiProperty({
        description: 'Contact name',
        example: 'Contact Name',
    })
    name: string;

    @ApiProperty({
        description: 'Contact title',
        example: 'Contact Title',
    })
    title: string;

    @ApiProperty({
        description: 'Contact code',
        example: 'CONTACT_CODE',
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

