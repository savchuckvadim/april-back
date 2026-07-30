import { Type } from 'class-transformer';
import { IBXUser } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import {
    ValidateNested,
    IsArray,
    IsBoolean,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BXUserDto } from './kpi-report-request.dto';
import {
    KPI_REQUEST_MODES,
    KpiRequestMode,
} from '../constants/report-queue.const';

export class GetCallingStatisticFiltersDto {
    @ApiProperty({
        description:
            'Сотрудники, по которым считаются счётчики звонков ' +
            '(ID → PORTAL_USER_ID в фильтре voximplant.statistic.get).',
        type: [BXUserDto],
    })
    @ValidateNested({ each: true })
    @Type(() => BXUserDto)
    @IsArray()
    @IsNotEmpty()
    departament: IBXUser[];

    @ApiProperty({
        description:
            'Начало периода. Канонично YYYY-MM-DD (граница включительно); ' +
            'поддерживается легаси DD.MM.YYYY (старый фронт).',
        type: String,
        example: '2026-07-01',
    })
    @IsString()
    dateFrom: string;

    @ApiProperty({
        description:
            'Конец периода. Канонично YYYY-MM-DD — ВКЛЮЧИТЕЛЬНО (+1 день ' +
            'строит бэкенд); легаси DD.MM.YYYY — ЭКСКЛЮЗИВНО (старый фронт ' +
            'прибавляет день сам). Семантика определяется форматом.',
        type: String,
        example: '2026-07-30',
    })
    @IsString()
    dateTo: string;
}

export class GetCallingStatisticDto {
    @ApiProperty({
        description:
            'Домен портала Битрикс24, по которому PBXService выдаёт инстанс API.',
        type: String,
        example: 'example.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: 'Фильтры выборки: отдел и период.',
        type: GetCallingStatisticFiltersDto,
    })
    @ValidateNested()
    @Type(() => GetCallingStatisticFiltersDto)
    filters: GetCallingStatisticFiltersDto;

    @ApiPropertyOptional({
        description:
            'Режим запроса. queue — очередь: мгновенный ответ ' +
            '{status: ready|queued|error}, готовый результат по WS ' +
            'kpi-report:calling-statistic:done либо поллингом (повторный ' +
            'POST). sync (или поле не передано) — легаси-расчёт в ' +
            'HTTP-запросе, сырой массив в ответе (для старого фронта).',
        enum: KPI_REQUEST_MODES,
        default: 'sync',
        example: 'queue',
    })
    @IsOptional()
    @IsIn(KPI_REQUEST_MODES)
    mode?: KpiRequestMode;

    @ApiPropertyOptional({
        description:
            'ID WebSocket-соединения (режим queue) — на него адресно придут ' +
            'события done/error. Без socketId очередь работает через поллинг.',
        type: String,
        example: 'H4tbA2vBQ1e6bBv-AAAB',
    })
    @IsOptional()
    @IsString()
    socketId?: string;

    @ApiPropertyOptional({
        description:
            'Пересчитать, игнорируя кэш; свежий результат перезапишет кэш. ' +
            'Также это рычаг повтора после status error.',
        type: Boolean,
        default: false,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    forceRefresh?: boolean;
}
