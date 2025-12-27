import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BtxStageResponseDto } from './btx-stage-response.dto';
import { BitrixFieldEntityType } from '../../bitrixfields/enums/bitrixfield-entity-type.enum';

export class BtxCategoryResponseDto {
    @ApiProperty({
        description: 'Category ID',
        example: 1,
    })
    id: number;

    @ApiProperty({
        description: 'Entity type',
        example: BitrixFieldEntityType.DEAL,
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
        example: 'cold',
    })
    parent_type: string;

    @ApiProperty({
        description: 'Category type',
        example: 'deal',
    })
    type: string;

    @ApiProperty({
        description: 'Category group',
        example: 'sales',
    })
    group: string;

    @ApiProperty({
        description: 'Category title',
        example: 'Category Title',
    })
    title: string;

    @ApiProperty({
        description: 'Category name',
        example: 'category_name',
    })
    name: string;

    @ApiProperty({
        description: 'Bitrix ID',
        example: '23',
    })
    bitrixId: string;

    @ApiProperty({
        description: 'Bitrix Camel ID',
        example: 'ufCrm23',
    })
    bitrixCamelId: string;

    @ApiProperty({
        description: 'Category code',
        example: 'category_code',
    })
    code: string;

    @ApiProperty({
        description: 'Is active',
        example: true,
    })
    isActive: boolean;

    @ApiPropertyOptional({
        description: 'Category stages',
        type: [BtxStageResponseDto],
    })
    stages?: BtxStageResponseDto[];

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

