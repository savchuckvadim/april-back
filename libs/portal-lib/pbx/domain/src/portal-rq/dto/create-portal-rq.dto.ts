import { ApiProperty } from '@nestjs/swagger';
import {
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';

/**
 * Данные для создания пресета реквизита (`bx_rqs`).
 * Уникальность строки — по сочетанию code + portalId.
 */
export class CreatePortalRqDto {
    @ApiProperty({
        description: 'ID портала в нашей БД',
        example: 1,
        type: Number,
    })
    @IsInt()
    @Min(1)
    portalId!: number;

    @ApiProperty({
        description: 'Бизнес-код пресета (org/ip/fiz)',
        example: 'org',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    code!: string;

    @ApiProperty({
        description: 'Название пресета',
        example: 'Организация',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    name?: string | null;

    @ApiProperty({
        description: 'Тип пресета',
        example: 'organization',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    type?: string | null;

    @ApiProperty({
        description: 'ID пресета в Bitrix',
        example: 1,
        required: false,
        type: Number,
    })
    @IsOptional()
    @IsInt()
    bitrixId?: number | null;

    @ApiProperty({
        description: 'XML_ID пресета в Bitrix',
        example: 'rq_preset_org',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    xmlId?: string | null;

    @ApiProperty({
        description: 'ENTITY_TYPE_ID пресета в Bitrix',
        example: 8,
        required: false,
        type: Number,
    })
    @IsOptional()
    @IsInt()
    entityTypeId?: number | null;

    @ApiProperty({
        description: 'COUNTRY_ID пресета в Bitrix',
        example: '1',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    countryId?: string | null;

    @ApiProperty({
        description: 'Активен ли пресет',
        example: true,
        required: false,
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @ApiProperty({
        description: 'Порядок сортировки',
        example: 100,
        required: false,
        type: Number,
    })
    @IsOptional()
    @IsInt()
    sort?: number | null;
}
