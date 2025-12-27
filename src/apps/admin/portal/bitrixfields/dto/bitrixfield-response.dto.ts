import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BitrixFieldItemResponseDto } from './bitrixfield-item-response.dto';
import { BitrixFieldEntityType } from '../enums/bitrixfield-entity-type.enum';

export class BitrixFieldResponseDto {
    @ApiProperty({
        description: 'Field ID',
        example: 1,
    })
    id: number;

    @ApiProperty({
        description: 'Entity type',
        example: BitrixFieldEntityType.SMART,
        enum: BitrixFieldEntityType,
    })
    entity_type: BitrixFieldEntityType | string;

    @ApiProperty({
        description: 'Entity ID',
        example: 1,
    })
    entity_id: number;

    @ApiProperty({
        description: 'Parent type',
        example: 'list',
    })
    parent_type: string;

    @ApiProperty({
        description: 'Field type',
        example: 'select',
    })
    type: string;

    @ApiProperty({
        description: 'Field title',
        example: 'Field Title',
    })
    title: string;

    @ApiProperty({
        description: 'Field name',
        example: 'field_name',
    })
    name: string;

    @ApiProperty({
        description: 'Bitrix ID',
        example: 'UF_CRM_123',
    })
    bitrixId: string;

    @ApiProperty({
        description: 'Bitrix Camel ID',
        example: 'ufCrm123',
    })
    bitrixCamelId: string;

    @ApiProperty({
        description: 'Field code',
        example: 'field_code',
    })
    code: string;

    @ApiPropertyOptional({
        description: 'Field items',
        type: [BitrixFieldItemResponseDto],
    })
    items?: BitrixFieldItemResponseDto[];

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

