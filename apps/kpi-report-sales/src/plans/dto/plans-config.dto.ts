import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import {
    PLAN_FACT_SOURCES,
    PLAN_INDICATOR_CODE_LIST,
    PLAN_PERIOD_TYPES,
    PLAN_UNITS,
    PlanFactSource,
    PlanIndicatorCode,
    PlanPeriodType,
    PlanUnit,
} from '../constants/plan-indicators.const';

/** Описание показателя из каталога (read-only справочник для фронта). */
export class PlanIndicatorMetaDto {
    @ApiProperty({
        description: 'Код показателя (истинная типизация portal-lib).',
        enum: PLAN_INDICATOR_CODE_LIST,
        example: 'calls_done',
    })
    code: PlanIndicatorCode;

    @ApiProperty({
        description: 'Единица измерения (форматирование значения).',
        enum: PLAN_UNITS,
        example: 'count',
    })
    unit: PlanUnit;

    @ApiProperty({
        description:
            'Источник ФАКТА: kpi — отчёт по событиям (factKey = innerCode); ' +
            'calling — статистика звонков (factKey = бакет длительности); ' +
            'finance — закрытые продажи (factKey = поле итогов сотрудника); ' +
            'airtime — эфирное время (factKey = airtimeSeconds).',
        enum: PLAN_FACT_SOURCES,
        example: 'kpi',
    })
    factSource: PlanFactSource;

    @ApiProperty({
        description: 'Ключ факта в источнике.',
        type: String,
        example: 'call_done',
    })
    factKey: string;

    @ApiProperty({
        description: 'Название показателя по умолчанию.',
        type: String,
        example: 'Звонки',
    })
    defaultName: string;
}

/** Настройка одного показателя на портале. */
export class PlanIndicatorConfigDto {
    @ApiProperty({
        description: 'Код показателя.',
        enum: PLAN_INDICATOR_CODE_LIST,
        example: 'calls_done',
    })
    @IsIn(PLAN_INDICATOR_CODE_LIST)
    code: PlanIndicatorCode;

    @ApiProperty({
        description: 'Показатель включён на портале (виден в отчётах).',
        type: Boolean,
        example: true,
    })
    @IsBoolean()
    enabled: boolean;

    @ApiProperty({
        description:
            'Своё название показателя на портале; null — использовать defaultName.',
        type: String,
        nullable: true,
        example: 'План продаж',
    })
    @IsOptional()
    @IsString()
    customName: string | null;

    @ApiProperty({
        description:
            'На какой период руководитель задаёт значение плана. ' +
            'Отчёт пересчитывает план под выбранный период просмотра.',
        enum: PLAN_PERIOD_TYPES,
        example: 'month',
    })
    @IsIn(PLAN_PERIOD_TYPES)
    periodType: PlanPeriodType;
}

/** Портальный конфиг планов (строка-сентинел report_settings, bxUserId=0). */
export class PlansConfigDto {
    @ApiProperty({
        description: 'Версия формата конфига.',
        type: Number,
        example: 1,
    })
    version: number;

    @ApiProperty({
        description: 'Настройки показателей (полный список каталога).',
        type: [PlanIndicatorConfigDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PlanIndicatorConfigDto)
    indicators: PlanIndicatorConfigDto[];
}

export class PlansConfigGetRequestDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24.',
        type: String,
        example: 'april.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;
}

export class PlansConfigGetResponseDto {
    @ApiProperty({
        description: 'Каталог показателей (справочник, read-only).',
        type: [PlanIndicatorMetaDto],
    })
    catalog: PlanIndicatorMetaDto[];

    @ApiProperty({
        description:
            'Текущий конфиг портала (дефолт — все показатели выключены).',
        type: PlansConfigDto,
    })
    config: PlansConfigDto;
}

export class PlansConfigSaveRequestDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24.',
        type: String,
        example: 'april.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: 'Новый конфиг планов портала.',
        type: PlansConfigDto,
    })
    @ValidateNested()
    @Type(() => PlansConfigDto)
    config: PlansConfigDto;
}

export class PlansConfigSaveResponseDto {
    @ApiProperty({
        description: 'Сохранённый конфиг.',
        type: PlansConfigDto,
    })
    config: PlansConfigDto;
}
