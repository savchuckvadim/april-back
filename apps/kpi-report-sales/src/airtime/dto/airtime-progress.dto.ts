import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
    AIRTIME_MONTH_STATUSES,
    AirtimeMonthStatus,
} from '../constants/airtime-queue.const';
import type {
    IAirtimeMonthProgress,
    IAirtimeProgress,
} from '../types/airtime-statistic.type';

export class AirtimeMonthProgressDto implements IAirtimeMonthProgress {
    @ApiProperty({
        description: 'Календарный месяц периода в формате yyyy-MM.',
        type: String,
        example: '2026-03',
    })
    @IsString()
    month: string;

    @ApiProperty({
        description:
            'Готовность месяца: ready — партиция собрана и лежит в кэше; ' +
            'queued — сбор в очереди/выполняется; error — сбор упал ' +
            '(повтор — кнопкой «Пересчитать» или после протухания error-маркера).',
        enum: AIRTIME_MONTH_STATUSES,
        example: 'ready',
    })
    @IsIn(AIRTIME_MONTH_STATUSES)
    status: AirtimeMonthStatus;
}

export class AirtimeProgressDto implements IAirtimeProgress {
    @ApiProperty({
        description: 'Всего месяцев в запрошенном периоде.',
        type: Number,
        example: 8,
    })
    @IsInt()
    @Min(0)
    totalMonths: number;

    @ApiProperty({
        description: 'Из них уже собрано и лежит в кэше.',
        type: Number,
        example: 3,
    })
    @IsInt()
    @Min(0)
    readyMonths: number;

    @ApiProperty({
        description: 'Постатусный список месяцев периода.',
        type: [AirtimeMonthProgressDto],
    })
    @Type(() => AirtimeMonthProgressDto)
    @IsArray()
    @ValidateNested({ each: true })
    months: AirtimeMonthProgressDto[];

    @ApiPropertyOptional({
        description:
            'Оценка остатка сбора в секундах (скользящее среднее длительности ' +
            'партиций этого портала; приблизительно — очередь других порталов ' +
            'не учитывается). Есть только пока остаются несобранные месяцы.',
        type: Number,
        example: 240,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    etaSeconds?: number;
}
