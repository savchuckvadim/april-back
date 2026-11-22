import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import { IsBooleanFlag } from '@lib/core/decorators/dto/boolean-flag.decorator';
import { LOG_QUERY_HOURS, LOG_QUERY_ROWS } from '../../log-query.types';
import {
    BITRIX_FAILURE_KINDS,
    BitrixFailureGroupStat,
    BitrixFailureKindView,
    BitrixFailureRowView,
    BitrixFailuresView,
    BitrixFailureSummary,
} from '../../bitrix-failures/bitrix-failures.types';

export class BitrixFailuresQueryDto {
    @ApiPropertyOptional({
        description: 'Окно в часах: от 1 до 720 (журналы хранятся 30 дней).',
        type: Number,
        minimum: LOG_QUERY_HOURS.min,
        maximum: LOG_QUERY_HOURS.max,
        default: LOG_QUERY_HOURS.fallback,
        example: 24,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(LOG_QUERY_HOURS.min)
    @Max(LOG_QUERY_HOURS.max)
    hours?: number;

    @ApiPropertyOptional({
        description:
            'Портал Битрикса: сбои только его запросов (domain записи журнала).',
        type: String,
        example: 'april-garant.bitrix24.ru',
    })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    domain?: string;

    @ApiPropertyOptional({
        description: 'Приложение, из которого шёл запрос в Битрикс.',
        type: String,
        example: 'event-sales',
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    app?: string;

    @ApiPropertyOptional({
        description:
            'Только сбои записи (данные не дошли до Битрикса). Влияет на ' +
            'строки; сводка всегда считает и запись, и чтение. Принимаются ' +
            '1/true/yes.',
        type: Boolean,
        default: false,
        example: true,
    })
    @IsOptional()
    @IsBooleanFlag()
    writeOnly?: boolean;

    @ApiPropertyOptional({
        description: 'Сколько последних сбоев вернуть: до 500.',
        type: Number,
        minimum: 1,
        maximum: LOG_QUERY_ROWS.max,
        default: LOG_QUERY_ROWS.fallback,
        example: 100,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(LOG_QUERY_ROWS.max)
    limit?: number;
}

export class BitrixFailureRowDto implements BitrixFailureRowView {
    @ApiProperty({
        description: 'Время сбоя, ISO UTC.',
        type: String,
        example: '2026-11-20T06:43:05.123000Z',
    })
    at: string;

    @ApiProperty({
        description: 'Приложение, из которого шёл запрос; пусто — не известно.',
        type: String,
        example: 'event-sales',
    })
    app: string;

    @ApiProperty({
        description: 'Портал Битрикса.',
        type: String,
        example: 'april-garant.bitrix24.ru',
    })
    domain: string;

    @ApiProperty({
        description:
            'Что не выполнилось: `call` — одиночный вызов (попытки исчерпаны ' +
            'или ошибка не лечится повтором), `batch` — пачка целиком, ' +
            '`command` — одна команда внутри выполненной пачки.',
        type: String,
        enum: BITRIX_FAILURE_KINDS,
        example: 'batch',
    })
    kind: BitrixFailureKindView;

    @ApiProperty({
        description: 'Метод REST Битрикса; у пачки целиком — `batch`.',
        type: String,
        example: 'crm.deal.update',
    })
    method: string;

    @ApiProperty({
        description:
            'Сбой записи: данные не дошли до Битрикса. У пачки — была ли в ней ' +
            'хоть одна команда записи.',
        type: Boolean,
        example: true,
    })
    write: boolean;

    @ApiProperty({
        description:
            'Что было в пачке — по сущностям; пусто, если это не пачка.',
        type: String,
        example: 'строка списка ×2, сделка ×1, задача ×1',
    })
    commands: string;

    @ApiProperty({
        description: 'Сколько команд было в пачке; 0 — не пачка.',
        type: Number,
        example: 4,
    })
    commandsTotal: number;

    @ApiProperty({
        description:
            'Сущность самого запроса (id из его параметров); пусто — не известна.',
        type: String,
        example: 'сделка 26735',
    })
    target: string;

    @ApiPropertyOptional({
        description:
            'HTTP-статус ответа Битрикса; null — ответа не было (таймаут, обрыв).',
        type: Number,
        nullable: true,
        example: 500,
    })
    status: number | null;

    @ApiProperty({
        description: 'Суть ошибки: текст, код и описание Битрикса.',
        type: String,
        example: 'Request failed with status code 500 · HTTP 500',
    })
    error: string;

    @ApiProperty({
        description:
            'Операция по-русски («Отчёт «Звонки»», «Крон: подстраховка ХО»); ' +
            'пусто — точка входа не подписана.',
        type: String,
        example: 'Отчёт «Звонки»',
    })
    operation: string;

    @ApiProperty({
        description: 'Точка входа: HTTP-маршрут, крон или очередь.',
        type: String,
        example: 'queue:event-sales-flow',
    })
    source: string;

    @ApiProperty({
        description:
            'Тип карточки, ради которой шла работа: deal, company, lead, ' +
            'contact, task, smart; пусто — не известна.',
        type: String,
        example: 'deal',
    })
    entityType: string;

    @ApiProperty({
        description:
            'Id карточки, ради которой шла работа; пусто — не известна.',
        type: String,
        example: '26735',
    })
    entityId: string;

    @ApiPropertyOptional({
        description: 'Сотрудник Битрикса, от имени которого шла работа.',
        type: Number,
        nullable: true,
        example: 325,
    })
    actorId: number | null;

    @ApiProperty({
        description: 'Имя сотрудника, если известно; иначе пусто.',
        type: String,
        example: 'Иванов Иван',
    })
    actorName: string;
}

export class BitrixFailureGroupStatDto implements BitrixFailureGroupStat {
    @ApiProperty({
        description:
            'Приложение или операция; пусто — точка входа не подписана.',
        type: String,
        example: 'Отчёт «Звонки»',
    })
    name: string;

    @ApiProperty({ description: 'Сбоев записи.', type: Number, example: 12 })
    writes: number;

    @ApiProperty({ description: 'Сбоев чтения.', type: Number, example: 3 })
    reads: number;

    @ApiProperty({ description: 'Всего сбоев.', type: Number, example: 15 })
    total: number;
}

export class BitrixFailureSummaryDto implements BitrixFailureSummary {
    @ApiProperty({ description: 'Окно в часах.', type: Number, example: 24 })
    hours: number;

    @ApiProperty({
        description: 'Начало окна, ISO UTC.',
        type: String,
        example: '2026-11-19T09:00:00.000Z',
    })
    from: string;

    @ApiProperty({
        description: 'Конец окна, ISO UTC.',
        type: String,
        example: '2026-11-20T09:00:00.000Z',
    })
    to: string;

    @ApiProperty({
        description: 'Всего сбоев за окно (запись и чтение).',
        type: Number,
        example: 40,
    })
    total: number;

    @ApiProperty({
        description: 'Сбоев записи: данные не дошли до Битрикса.',
        type: Number,
        example: 31,
    })
    writes: number;

    @ApiProperty({ description: 'Сбоев чтения.', type: Number, example: 9 })
    reads: number;

    @ApiProperty({
        description: 'По приложениям: больше сбоев записи — выше.',
        type: [BitrixFailureGroupStatDto],
    })
    apps: BitrixFailureGroupStatDto[];

    @ApiProperty({
        description: 'По операциям: больше сбоев записи — выше.',
        type: [BitrixFailureGroupStatDto],
    })
    operations: BitrixFailureGroupStatDto[];
}

export class BitrixFailuresResponseDto implements BitrixFailuresView {
    @ApiProperty({
        description:
            'Сводка за окно: запись и чтение, по приложениям и операциям.',
        type: BitrixFailureSummaryDto,
    })
    summary: BitrixFailureSummaryDto;

    @ApiProperty({
        description: 'Последние сбои, новые сверху (с учётом «только запись»).',
        type: [BitrixFailureRowDto],
    })
    rows: BitrixFailureRowDto[];
}
