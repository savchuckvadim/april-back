import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
} from 'class-validator';
import {
    SALES_HOT_THRESHOLDS,
    SalesHotThreshold,
} from '../constants/sales-finance.const';

/**
 * Запрос списка «горячих» клиентов: открытые сделки воронки
 * «ОП Основная» от заданной стадии и выше.
 */
export class HotClientsRequestDto {
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
            'готовый результат придёт по WS событием sales-finance:hot-clients:done.',
        type: String,
        example: 'sock_abc123',
    })
    @IsOptional()
    @IsString()
    socketId?: string;

    @ApiPropertyOptional({
        description:
            'Пересчитать список, игнорируя кэш. Свежий результат перезапишет кэш.',
        type: Boolean,
        default: false,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    forceRefresh?: boolean;

    @ApiProperty({
        description:
            'Порог воронки: presentation — от стадии «Презентация» и выше, ' +
            'document — от стадии «Документы» и выше.',
        enum: SALES_HOT_THRESHOLDS,
        example: 'document',
    })
    @IsIn(SALES_HOT_THRESHOLDS)
    threshold: SalesHotThreshold;

    @ApiPropertyOptional({
        description:
            'Необязательный фильтр по ответственным (ASSIGNED_BY_ID). ' +
            'Без него берутся все открытые сделки воронки.',
        type: [Number],
        example: [123, 456],
    })
    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    assignedIds?: number[];
}
