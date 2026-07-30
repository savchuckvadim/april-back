import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsArray,
    IsBoolean,
    IsIn,
    IsObject,
    IsOptional,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BXUserDto } from '../../shared/dto/bx-user.dto';
import {
    KPI_REQUEST_MODES,
    KpiRequestMode,
} from '../constants/report-queue.const';

// BXUserDto вынесен в shared (общий для report / airtime / calling-statistic).
// Ре-экспорт сохраняет обратную совместимость для импортов внутри report.
export { BXUserDto };

export class ReportGetFiltersDto {
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

    @ApiProperty({
        description:
            'ID сотрудников (исторически дублирует departament; бэкенд ' +
            'использует departament).',
        type: [String],
    })
    @IsArray()
    userIds: Array<string | number>;

    @ApiProperty({
        description: 'Сотрудники отдела, по которым считается KPI-отчёт.',
        type: [BXUserDto],
    })
    @ValidateNested({ each: true })
    @Type(() => BXUserDto)
    @IsArray()
    departament: BXUserDto[];

    @ApiProperty({
        description:
            'Игнорируется бэкендом (ID полей берутся из настроек портала). ' +
            'Оставлено для обратной совместимости со старым фронтом.',
        type: String,
    })
    @IsString()
    userFieldId: string;

    @ApiProperty({
        description:
            'Игнорируется бэкендом (ID полей берутся из настроек портала).',
        type: String,
    })
    @IsString()
    dateFieldId: string;

    @ApiProperty({
        description:
            'Игнорируется бэкендом (ID полей берутся из настроек портала).',
        type: String,
    })
    @IsString()
    actionFieldId: string;

    @ApiProperty({
        description:
            'Игнорируется бэкендом (матрица действий строится из настроек ' +
            'портала). Оставлено для обратной совместимости.',
        type: Object,
    })
    @IsObject()
    currentActions: Record<string, unknown>;
}

export class ReportGetRequestDto {
    @ApiProperty({
        description:
            'Домен портала Битрикс24, по которому PBXService выдаёт инстанс API.',
        type: String,
        example: 'example.bitrix24.ru',
    })
    @IsString()
    domain: string;

    @ApiProperty({
        description: 'Фильтры выборки: отдел и период.',
        type: ReportGetFiltersDto,
    })
    @ValidateNested()
    @Type(() => ReportGetFiltersDto)
    filters: ReportGetFiltersDto;

    @ApiPropertyOptional({
        description:
            'Режим запроса. queue — очередь: мгновенный ответ ' +
            '{status: ready|queued|error}, готовый отчёт по WS ' +
            'kpi-report:done либо поллингом (повторный POST). sync (или ' +
            'поле не передано) — легаси-расчёт в HTTP-запросе, сырой ' +
            'массив ReportData[] в ответе (для старого фронта).',
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
