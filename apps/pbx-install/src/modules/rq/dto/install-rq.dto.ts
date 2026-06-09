import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { ERqPresetCode } from '@lib/portal-lib/pbx-domain';
import type { RqFieldTemplate, RqPresetTemplate } from '@/apps/rq/install';

/** Пресет реквизита для установки (тело POST). */
export class InstallRqPresetDto implements RqPresetTemplate {
    @ApiProperty({
        description: 'Бизнес-код пресета',
        enum: ERqPresetCode,
        example: ERqPresetCode.ORG,
    })
    @IsEnum(ERqPresetCode)
    code!: ERqPresetCode;

    @ApiProperty({ description: 'Имя пресета', example: 'Организация' })
    @IsString()
    @IsNotEmpty()
    name!: string;

    @ApiProperty({ description: 'Технический разрез', example: 'org' })
    @IsString()
    @IsNotEmpty()
    type!: string;

    @ApiProperty({
        description: 'Стабильный XML_ID',
        example: 'april_rq_preset_org',
    })
    @IsString()
    @IsNotEmpty()
    xmlId!: string;

    @ApiProperty({ description: 'ENTITY_TYPE_ID (8 = реквизит)', example: 8 })
    @IsInt()
    entityTypeId!: number;

    @ApiProperty({ description: 'COUNTRY_ID (1 = Россия)', example: 1 })
    @IsInt()
    countryId!: number;

    @ApiProperty({ description: 'Дефолтный bitrix_id (fallback)', example: 1 })
    @IsInt()
    defaultBitrixId!: number;

    @ApiProperty({ description: 'Порядок сортировки', example: 100 })
    @IsInt()
    sort!: number;
}

/** Поле реквизита для установки (тело POST). */
export class InstallRqFieldDto implements RqFieldTemplate {
    @ApiProperty({ description: 'Стабильный XML_ID', example: 'position_case' })
    @IsString()
    @IsNotEmpty()
    xmlId!: string;

    @ApiProperty({ description: 'Подпись поля', example: 'Должность (в лице)' })
    @IsString()
    @IsNotEmpty()
    label!: string;

    @ApiProperty({ description: 'USER_TYPE_ID Bitrix', example: 'string' })
    @IsString()
    @IsNotEmpty()
    userTypeId!: string;

    @ApiProperty({
        description: 'Множественное поле',
        required: false,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    isMultiple?: boolean;

    @ApiProperty({ description: 'Ставить поле (gating)', example: true })
    @IsBoolean()
    isNeedUpdate!: boolean;
}

/** Тело установки пресетов. */
export class InstallRqPresetsBodyDto {
    @ApiProperty({
        description: 'Пресеты для установки',
        type: [InstallRqPresetDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => InstallRqPresetDto)
    presets!: InstallRqPresetDto[];
}

/** Тело установки полей. */
export class InstallRqFieldsBodyDto {
    @ApiProperty({
        description: 'Поля для установки',
        type: [InstallRqFieldDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => InstallRqFieldDto)
    fields!: InstallRqFieldDto[];
}

/** Тело удаления по списку id (пресеты в Bitrix / поля реквизита). */
export class DeleteRqByIdsDto {
    @ApiProperty({
        description: 'Список id для удаления в Bitrix',
        type: [Number],
        example: [12, 13],
    })
    @IsArray()
    @IsInt({ each: true })
    ids!: number[];
}
