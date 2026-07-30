import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';
import { BXUserDto } from '../../shared/dto/bx-user.dto';
import {
    KPI_QUEUE_RESPONSE_STATUSES,
    KpiQueueResponseStatus,
} from '../constants/report-queue.const';

export class CallingStatisticCallingDto {
    @ApiProperty({
        description:
            "Бакет длительности: 'all' — все наборы номера, число — порог " +
            'в секундах (30/60/180/300/600), счётчик звонков ДЛИННЕЕ порога.',
        type: String,
        example: 'all',
    })
    @IsString()
    id: string;

    @ApiProperty({
        description: 'Человекочитаемое название бакета.',
        type: String,
        example: 'Наборов номера',
    })
    @IsString()
    action: string;

    @ApiProperty({
        description: 'Число звонков сотрудника в бакете за период.',
        type: Number,
        example: 88,
    })
    @IsInt()
    @Min(0)
    count: number;

    @ApiProperty({
        description:
            'Зарезервировано (всегда 0 — длительности не суммируются).',
        type: Number,
        example: 0,
    })
    @IsInt()
    duration: number;
}

export class CallingStatisticItemDto {
    @ApiProperty({
        description: 'Сотрудник Битрикс24.',
        type: BXUserDto,
    })
    @Type(() => BXUserDto)
    @ValidateNested()
    user: BXUserDto;

    @ApiProperty({
        description: 'Имя сотрудника для вывода в отчёте.',
        type: String,
        example: 'Иван',
    })
    @IsString()
    userName: string;

    @ApiProperty({
        description:
            'Счётчики по всем 6 бакетам длительности (кардинальность ' +
            'гарантирована контролем полноты батча).',
        type: [CallingStatisticCallingDto],
    })
    @Type(() => CallingStatisticCallingDto)
    @IsArray()
    @ValidateNested({ each: true })
    callings: CallingStatisticCallingDto[];
}

/**
 * Ответ POST /kpi-report/calling-statistic в режиме queue.
 * Легаси-режим (без mode) отвечает сырым массивом элементов — описан в
 * description эндпоинта.
 */
export class CallingStatisticResponseDto {
    @ApiProperty({
        description:
            'Статус: ready — статистика готова (data заполнен); queued — ' +
            'расчёт в очереди (WS kpi-report:calling-statistic:done либо ' +
            'поллинг повторным POST); error — расчёт упал (message).',
        enum: KPI_QUEUE_RESPONSE_STATUSES,
        example: 'ready',
    })
    @IsIn(KPI_QUEUE_RESPONSE_STATUSES)
    status: KpiQueueResponseStatus;

    @ApiPropertyOptional({
        description: 'Статистика звонков по сотрудникам (status ready).',
        type: [CallingStatisticItemDto],
    })
    @IsOptional()
    @Type(() => CallingStatisticItemDto)
    @IsArray()
    @ValidateNested({ each: true })
    data?: CallingStatisticItemDto[];

    @ApiPropertyOptional({
        description:
            'Эхо ключа запроса `${from}|${to}|${sortedUserIds}` для матчинга ' +
            'WS-событий и отсева устаревших ответов.',
        type: String,
        example: '2026-07-01|2026-07-30|12_34',
    })
    @IsOptional()
    @IsString()
    requestKey?: string;

    @ApiPropertyOptional({
        description: 'Текст ошибки расчёта (status error).',
        type: String,
        example: 'Битрикс не вернул 6 из 12 команд (статистика звонков)…',
    })
    @IsOptional()
    @IsString()
    message?: string;
}
