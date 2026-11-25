import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsIn,
    IsISO8601,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { ReportData } from '../../shared/dto/kpi.dto';
import {
    KPI_QUEUE_RESPONSE_STATUSES,
    KpiQueueResponseStatus,
} from '../constants/report-queue.const';

/**
 * Ответ POST /kpi-report/get в режиме queue.
 * Легаси-режим (без mode) отвечает сырым массивом ReportData[] — описан
 * в description эндпоинта; каноничный контракт для новых клиентов — этот
 * конверт.
 */
export class KpiReportGetResponseDto {
    @ApiProperty({
        description:
            'Статус: ready — отчёт готов (data заполнен); queued — расчёт ' +
            'в очереди, результат придёт WS-событием kpi-report:done либо ' +
            'повторным POST (поллинг до status ready); error — расчёт упал ' +
            '(текст в message), повтор — forceRefresh.',
        enum: KPI_QUEUE_RESPONSE_STATUSES,
        example: 'ready',
    })
    @IsIn(KPI_QUEUE_RESPONSE_STATUSES)
    status: KpiQueueResponseStatus;

    @ApiPropertyOptional({
        description: 'KPI-отчёт по сотрудникам (status ready).',
        type: [ReportData],
    })
    @IsOptional()
    @Type(() => ReportData)
    @IsArray()
    @ValidateNested({ each: true })
    data?: ReportData[];

    @ApiPropertyOptional({
        description:
            'Эхо ключа запроса `${from}|${to}|${sortedUserIds}` — фронт ' +
            'матчит по нему WS-события и отбрасывает устаревшие ответы.',
        type: String,
        example: '2026-07-01|2026-07-30|12_34',
    })
    @IsOptional()
    @IsString()
    requestKey?: string;

    @ApiPropertyOptional({
        description:
            'Когда результат рассчитан (дата и время в формате ISO 8601). ' +
            'Приходит со статусом ready — фронт показывает её рядом с ' +
            'кнопкой «Пересчитать».',
        type: String,
        example: '2026-11-12T07:40:12.000Z',
    })
    @IsOptional()
    @IsISO8601()
    generatedAt?: string;

    @ApiPropertyOptional({
        description:
            'Период целиком лежит в прошлых месяцах: результат хранится ' +
            '180 дней и сам не пересчитывается, пересчёт — запросом с ' +
            'forceRefresh: true. Приходит со статусом ready.',
        type: Boolean,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    closedPeriod?: boolean;

    @ApiPropertyOptional({
        description: 'Текст ошибки расчёта (status error).',
        type: String,
        example: 'Битрикс не вернул 3 из 40 команд (KPI-отчёт)…',
    })
    @IsOptional()
    @IsString()
    message?: string;
}
