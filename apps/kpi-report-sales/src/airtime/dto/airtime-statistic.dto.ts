import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsISO8601,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    Min,
    ValidateNested,
} from 'class-validator';
import { BXUserDto } from '../../shared/dto/bx-user.dto';
import {
    AIRTIME_REQUEST_MODES,
    AIRTIME_RESPONSE_STATUSES,
    AirtimeRequestMode,
    AirtimeResponseStatus,
} from '../constants/airtime-queue.const';
import { AirtimeProgressDto } from './airtime-progress.dto';
import {
    IAirtimeDirectionStat,
    IAirtimeStatisticResult,
    IAirtimeUserResult,
} from '../types/airtime-statistic.type';

export class AirtimeStatisticFiltersDto {
    @ApiProperty({
        description:
            'Сотрудники отдела, по которым считается эфирное время. ' +
            'ID используется как PORTAL_USER_ID в фильтре voximplant.statistic.get.',
        type: [BXUserDto],
    })
    @Type(() => BXUserDto)
    @IsArray()
    @ValidateNested({ each: true })
    @ArrayMinSize(1)
    departament: BXUserDto[];

    @ApiProperty({
        description:
            'Начало периода (нижняя граница CALL_START_DATE), ' +
            'дата в ISO-формате с часовым поясом портала.',
        type: String,
        example: '2026-07-01T00:00:00+03:00',
    })
    @IsISO8601()
    dateFrom: string;

    @ApiProperty({
        description:
            'Конец периода (верхняя граница CALL_START_DATE), ' +
            'дата в ISO-формате с часовым поясом портала.',
        type: String,
        example: '2026-07-31T23:59:59+03:00',
    })
    @IsISO8601()
    dateTo: string;

    @ApiPropertyOptional({
        description:
            'Максимум строк статистики, выгружаемых из Битрикс за один отчёт — ' +
            'защита от разноса пагинации на больших периодах. ' +
            'При достижении лимита ответ помечается truncated: true. ' +
            'Действует только в режиме sync; воркер очереди использует ' +
            'собственный лимит на партицию.',
        type: Number,
        minimum: 50,
        maximum: 50000,
        default: 10000,
        example: 10000,
    })
    @IsOptional()
    @IsInt()
    @Min(50)
    @Max(50000)
    maxRows?: number;
}

export class GetAirtimeStatisticDto {
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
        description: 'Фильтры выборки: отдел, период, лимит строк.',
        type: AirtimeStatisticFiltersDto,
    })
    @Type(() => AirtimeStatisticFiltersDto)
    @ValidateNested()
    filters: AirtimeStatisticFiltersDto;

    @ApiPropertyOptional({
        description:
            'Режим запроса. queue — очередь месячных партиций: ответ приходит ' +
            'мгновенно (status ready из кэша или queued с прогрессом), готовый ' +
            'отчёт доезжает WS-событием airtime:done либо повторным POST ' +
            '(поллинг). sync (или поле не передано) — легаси-режим: расчёт ' +
            'прямо в HTTP-запросе, как раньше (для старого фронта; будет удалён).',
        enum: AIRTIME_REQUEST_MODES,
        default: 'sync',
        example: 'queue',
    })
    @IsOptional()
    @IsIn(AIRTIME_REQUEST_MODES)
    mode?: AirtimeRequestMode;

    @ApiPropertyOptional({
        description:
            'ID WebSocket-соединения клиента (режим queue): на него адресно ' +
            'приходят события airtime:progress / airtime:done / airtime:error. ' +
            'Без socketId очередь тоже работает — результат забирается ' +
            'поллингом (повторный POST до status ready).',
        type: String,
        example: 'H4tbA2vBQ1e6bBv-AAAB',
    })
    @IsOptional()
    @IsString()
    socketId?: string;

    @ApiPropertyOptional({
        description:
            'Пересчитать живой хвост периода (текущий месяц / сегодня), ' +
            'игнорируя кэш; готовые ПРОШЛЫЕ месяцы не пересчитываются ' +
            '(их сброс — POST /kpi-airtime/cache/reset). Также повторяет ' +
            'сбор месяцев, упавших с ошибкой.',
        type: Boolean,
        default: false,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    forceRefresh?: boolean;
}

export class AirtimeDirectionStatDto implements IAirtimeDirectionStat {
    @ApiProperty({
        description: 'Количество звонков данного направления за период.',
        type: Number,
        example: 42,
    })
    @IsInt()
    @Min(0)
    count: number;

    @ApiProperty({
        description:
            'Суммарная длительность звонков данного направления в секундах.',
        type: Number,
        example: 3600,
    })
    @IsInt()
    @Min(0)
    seconds: number;
}

export class AirtimeUserResultDto implements IAirtimeUserResult {
    @ApiProperty({
        description: 'Сотрудник Битрикс24, по которому посчитана статистика.',
        type: BXUserDto,
    })
    @Type(() => BXUserDto)
    @ValidateNested()
    user: BXUserDto;

    @ApiProperty({
        description:
            'Имя и фамилия сотрудника одной строкой — для вывода в отчёте.',
        type: String,
        example: 'Иван Иванов',
    })
    @IsString()
    userName: string;

    @ApiProperty({
        description:
            'Число состоявшихся звонков сотрудника за период ' +
            '(в выборку попадают только звонки с CALL_DURATION > 0).',
        type: Number,
        example: 87,
    })
    @IsInt()
    @Min(0)
    callsCount: number;

    @ApiProperty({
        description:
            'Эфирное время: сумма CALL_DURATION всех звонков сотрудника ' +
            'за период, в секундах.',
        type: Number,
        example: 12480,
    })
    @IsInt()
    @Min(0)
    airtimeSeconds: number;

    @ApiProperty({
        description:
            'Входящая коммуникация: звонки с CALL_TYPE 2 (входящий) ' +
            'и 3 (входящий с перенаправлением).',
        type: AirtimeDirectionStatDto,
    })
    @Type(() => AirtimeDirectionStatDto)
    @ValidateNested()
    incoming: AirtimeDirectionStatDto;

    @ApiProperty({
        description:
            'Исходящая коммуникация: звонки с CALL_TYPE 1 (исходящий) ' +
            'и 4 (callback).',
        type: AirtimeDirectionStatDto,
    })
    @Type(() => AirtimeDirectionStatDto)
    @ValidateNested()
    outgoing: AirtimeDirectionStatDto;
}

export class AirtimeStatisticResponseDto implements IAirtimeStatisticResult {
    @ApiProperty({
        description:
            'Результаты по каждому сотруднику переданного отдела. ' +
            'При status queued/error — ЧАСТИЧНЫЕ данные уже собранных ' +
            'месяцев (или пустой массив): UI показывает их «под стеклом» ' +
            'с прогрессом, полные цифры — по status ready.',
        type: [AirtimeUserResultDto],
    })
    @Type(() => AirtimeUserResultDto)
    @IsArray()
    @ValidateNested({ each: true })
    users: AirtimeUserResultDto[];

    @ApiProperty({
        description:
            'Сколько строк статистики выгружено из voximplant.statistic.get.',
        type: Number,
        example: 1234,
    })
    @IsInt()
    @Min(0)
    rowsFetched: number;

    @ApiProperty({
        description:
            'true — выгрузка остановлена по лимиту maxRows: эфирное время ' +
            'посчитано не по всем звонкам периода, сузьте период.',
        type: Boolean,
        example: false,
    })
    @IsBoolean()
    truncated: boolean;

    @ApiPropertyOptional({
        description:
            'Статус ответа в режиме queue: ready — отчёт собран (users ' +
            'заполнен); queued — сбор партиций идёт, users пуст, прогресс в ' +
            'progress; error — сбор упал (текст в message). В легаси-режиме ' +
            'sync поле отсутствует.',
        enum: AIRTIME_RESPONSE_STATUSES,
        example: 'ready',
    })
    @IsOptional()
    @IsIn(AIRTIME_RESPONSE_STATUSES)
    status?: AirtimeResponseStatus;

    @ApiPropertyOptional({
        description:
            'Прогресс сборки периода по месяцам (режим queue, status queued/error).',
        type: AirtimeProgressDto,
    })
    @IsOptional()
    @Type(() => AirtimeProgressDto)
    @ValidateNested()
    progress?: AirtimeProgressDto;

    @ApiPropertyOptional({
        description:
            'Эхо ключа запроса `${from}|${to}|${sortedUserIds}` — фронт ' +
            'матчит по нему WS-события и отбрасывает устаревшие ответы.',
        type: String,
        example: '2026-01-01|2026-07-30|12_34_56',
    })
    @IsOptional()
    @IsString()
    requestKey?: string;

    @ApiPropertyOptional({
        description: 'Текст ошибки сбора (status error).',
        type: String,
        example: 'Битрикс не вернул страницу статистики — повторите позже.',
    })
    @IsOptional()
    @IsString()
    message?: string;
}
