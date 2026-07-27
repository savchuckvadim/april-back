import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsPositive,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';
import {
    PLAN_INDICATOR_CODE_LIST,
    PlanIndicatorCode,
} from '../constants/plan-indicators.const';

/** Значение плана по одному показателю. */
export class PlanTargetValueDto {
    @ApiProperty({
        description: 'Код показателя.',
        enum: PLAN_INDICATOR_CODE_LIST,
        example: 'calls_done',
    })
    code: PlanIndicatorCode;

    @ApiProperty({
        description:
            'Значение плана на периодType показателя; null — план не задан.',
        type: Number,
        nullable: true,
        example: 500,
    })
    value: number | null;
}

/** Планы одного сотрудника (из его Bitrix user-полей UF_USR_A_SALES_PLAN_*). */
export class PlanUserTargetsDto {
    @ApiProperty({
        description: 'Bitrix ID сотрудника.',
        type: Number,
        example: 123,
    })
    userId: number;

    @ApiProperty({
        description: 'Значения планов по показателям каталога.',
        type: [PlanTargetValueDto],
    })
    values: PlanTargetValueDto[];
}

export class PlanTargetsGetRequestDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24.',
        type: String,
        example: 'april.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: 'Bitrix ID сотрудников.',
        type: [Number],
        example: [123, 456],
    })
    @IsArray()
    @IsInt({ each: true })
    userIds: number[];
}

export class PlanTargetsGetResponseDto {
    @ApiProperty({
        description: 'Планы по каждому запрошенному сотруднику.',
        type: [PlanUserTargetsDto],
    })
    targets: PlanUserTargetsDto[];
}

/** Одно изменение плана: сотрудник × показатель → значение. */
export class PlanTargetSaveItemDto {
    @ApiProperty({
        description: 'Bitrix ID сотрудника.',
        type: Number,
        example: 123,
    })
    @IsInt()
    @IsPositive()
    userId: number;

    @ApiProperty({
        description: 'Код показателя.',
        enum: PLAN_INDICATOR_CODE_LIST,
        example: 'calls_done',
    })
    @IsIn(PLAN_INDICATOR_CODE_LIST)
    code: PlanIndicatorCode;

    @ApiProperty({
        description: 'Новое значение плана (≥0); null — снять план.',
        type: Number,
        nullable: true,
        example: 500,
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    value?: number | null;
}

export class PlanTargetsSaveRequestDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24.',
        type: String,
        example: 'april.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: 'Изменения планов (батчем, группируются по сотруднику).',
        type: [PlanTargetSaveItemDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PlanTargetSaveItemDto)
    targets: PlanTargetSaveItemDto[];
}

export class PlanTargetsSaveResponseDto {
    @ApiProperty({
        description: 'Сколько сотрудников обновлено.',
        type: Number,
        example: 5,
    })
    updatedUsers: number;
}
