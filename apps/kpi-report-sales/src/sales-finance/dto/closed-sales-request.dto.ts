import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayNotEmpty,
    IsArray,
    IsBoolean,
    IsDateString,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';

/**
 * Фильтры отчёта по закрытым продажам: сотрудники + период по CLOSEDATE.
 */
export class ClosedSalesFiltersDto {
    @ApiProperty({
        description:
            'Список ID ответственных (ASSIGNED_BY_ID) — сотрудники отдела продаж. ' +
            'Один сотрудник передаётся массивом из одного элемента.',
        type: [Number],
        example: [123, 456],
    })
    @IsArray()
    @ArrayNotEmpty()
    @IsInt({ each: true })
    assignedIds: number[];

    @ApiProperty({
        description:
            'Начало периода по дате закрытия сделки (CLOSEDATE), ISO-дата.',
        type: String,
        example: '2026-01-01',
    })
    @IsDateString()
    dateFrom: string;

    @ApiProperty({
        description:
            'Конец периода по дате закрытия сделки (CLOSEDATE), ISO-дата (включительно).',
        type: String,
        example: '2026-06-30',
    })
    @IsDateString()
    dateTo: string;
}

/**
 * Запрос финансового отчёта по сделкам, закрытым в успех
 * (воронка «ОП Основная», код sales_base).
 */
export class ClosedSalesRequestDto {
    @ApiProperty({
        description:
            'Домен портала Bitrix24. По нему PBXService.init отдаёт инстанс bitrix и портал.',
        type: String,
        example: 'april.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiPropertyOptional({
        description:
            'ID WebSocket-соединения клиента. Если отчёт считается в очереди, ' +
            'готовый результат придёт по WS событием sales-finance:closed-sales:done.',
        type: String,
        example: 'sock_abc123',
    })
    @IsOptional()
    @IsString()
    socketId?: string;

    @ApiPropertyOptional({
        description:
            'Пересчитать отчёт, игнорируя кэш. Свежий результат перезапишет кэш.',
        type: Boolean,
        default: false,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    forceRefresh?: boolean;

    @ApiProperty({
        description: 'Фильтры отчёта: сотрудники и период.',
        type: ClosedSalesFiltersDto,
    })
    @ValidateNested()
    @Type(() => ClosedSalesFiltersDto)
    filters: ClosedSalesFiltersDto;
}
