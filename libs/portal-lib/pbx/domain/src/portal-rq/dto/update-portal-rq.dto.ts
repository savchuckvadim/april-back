import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

/**
 * Данные для частичного обновления пресета реквизита (`bx_rqs`).
 * code и portalId не меняются (это ключ строки).
 */
export class UpdatePortalRqDto {
    @ApiProperty({
        description: 'Название пресета',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    name?: string | null;

    @ApiProperty({ description: 'Тип пресета', required: false, type: String })
    @IsOptional()
    @IsString()
    type?: string | null;

    @ApiProperty({
        description: 'ID пресета в Bitrix',
        required: false,
        type: Number,
    })
    @IsOptional()
    @IsInt()
    bitrixId?: number | null;

    @ApiProperty({
        description: 'XML_ID пресета',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    xmlId?: string | null;

    @ApiProperty({
        description: 'ENTITY_TYPE_ID пресета',
        required: false,
        type: Number,
    })
    @IsOptional()
    @IsInt()
    entityTypeId?: number | null;

    @ApiProperty({
        description: 'COUNTRY_ID пресета',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    countryId?: string | null;

    @ApiProperty({
        description: 'Активен ли пресет',
        required: false,
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @ApiProperty({
        description: 'Порядок сортировки',
        required: false,
        type: Number,
    })
    @IsOptional()
    @IsInt()
    sort?: number | null;
}
