import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Matches,
    ValidateNested,
} from 'class-validator';
import { RpaNameEnum } from './install-rpa.dto';

/** Стадия RPA-воронки в body-запросе установки. */
export class RpaStageDto {
    @ApiProperty({ description: 'Имя стадии', example: 'Запуск' })
    @IsString()
    @IsNotEmpty()
    name!: string;

    @ApiProperty({ description: 'Заголовок стадии', example: 'Запуск' })
    @IsString()
    @IsNotEmpty()
    title!: string;

    @ApiProperty({ description: 'Код стадии', example: 'rpa_supply_new' })
    @IsString()
    @IsNotEmpty()
    code!: string;

    @ApiProperty({ description: 'Bitrix-идентификатор стадии', example: 'NEW' })
    @IsString()
    bitrixId!: string;

    @ApiProperty({ description: 'Цвет стадии', example: '#eef0e6' })
    @IsString()
    color!: string;

    @ApiProperty({ description: 'Семантика (SUCCESS/FAIL/пусто)', example: '' })
    @IsString()
    @IsOptional()
    semantic?: string;

    @ApiProperty({ description: 'Активна', example: true })
    @IsBoolean()
    isActive!: boolean;

    @ApiProperty({ description: 'Нужно обновлять', example: true })
    @IsBoolean()
    isNeedUpdate!: boolean;

    @ApiProperty({ description: 'Порядок сортировки', example: 10 })
    @IsNumber()
    order!: number;

    @ApiProperty({ description: 'Первая стадия', example: true })
    @IsBoolean()
    @IsOptional()
    isFirst?: boolean;

    @ApiProperty({ description: 'Успешная стадия', example: false })
    @IsBoolean()
    @IsOptional()
    isSuccess?: boolean;

    @ApiProperty({ description: 'Провальная стадия', example: false })
    @IsBoolean()
    @IsOptional()
    isFail?: boolean;
}

/** Единственная воронка RPA в body-запросе установки. */
export class RpaCategoryDto {
    @ApiProperty({ description: 'Id категории в шаблоне', example: '1' })
    @IsString()
    id!: string;

    @ApiProperty({ description: 'entityTypeId RPA-типа', example: '158' })
    @IsString()
    entityTypeId!: string;

    @ApiProperty({ description: 'Тип категории', example: 'supply' })
    @IsString()
    type!: string;

    @ApiProperty({ description: 'Группа', example: 'service' })
    @IsString()
    group!: string;

    @ApiProperty({ description: 'Имя', example: 'rpa_supply' })
    @IsString()
    name!: string;

    @ApiProperty({ description: 'Заголовок', example: 'rpa_supply' })
    @IsString()
    title!: string;

    @ApiProperty({ description: 'Bitrix id', example: '158' })
    @IsString()
    bitrixId!: string;

    @ApiProperty({ description: 'Bitrix camel id', example: 'RPA_158' })
    @IsString()
    @IsOptional()
    bitrixCamelId?: string;

    @ApiProperty({ description: 'Код', example: 'rpa_supply' })
    @IsString()
    code!: string;

    @ApiProperty({ description: 'Активна', example: true })
    @IsBoolean()
    isActive!: boolean;

    @ApiProperty({ description: 'Нужно обновлять', example: true })
    @IsBoolean()
    isNeedUpdate!: boolean;

    @ApiProperty({ description: 'Порядок', example: 10 })
    @IsNumber()
    order!: number;

    @ApiProperty({ description: 'По умолчанию', example: true })
    @IsBoolean()
    @IsOptional()
    isDefault?: boolean;

    @ApiProperty({ description: 'Стадии воронки', type: [RpaStageDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RpaStageDto)
    stages!: RpaStageDto[];
}

/**
 * Тело запроса установки воронки RPA массивом категорий (POST-вариант).
 * У RPA одна категория, но массив сохранён для единообразия со смартом.
 */
export class InstallRpaCategoryDto {
    @ApiProperty({
        description: 'Домен Bitrix-портала (без протокола).',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    @Matches(/^[a-z0-9.-]+\.[a-z]{2,}$/i, {
        message:
            'domain must be a valid hostname without protocol (e.g. example.bitrix24.ru)',
    })
    domain!: string;

    @ApiProperty({
        description: 'Имя RPA (совпадает с `btx_rpas.code`).',
        example: RpaNameEnum.SUPPLY,
        enum: RpaNameEnum,
    })
    @IsEnum(RpaNameEnum)
    rpaName!: RpaNameEnum;

    @ApiProperty({
        description: 'Воронки RPA с вложенными стадиями (ожидается одна).',
        type: [RpaCategoryDto],
    })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => RpaCategoryDto)
    categories!: RpaCategoryDto[];
}
