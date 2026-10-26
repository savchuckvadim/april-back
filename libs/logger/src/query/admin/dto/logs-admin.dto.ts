import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import {
    LOG_QUERY_HOURS,
    LOG_QUERY_LEVELS,
    LOG_QUERY_ROWS,
    LogAppStat,
    LogDomainStat,
    LogErrorPattern,
    LogQueryLevel,
    LogRowView,
    LogSummary,
} from '../../log-query.types';

export class LogsQueryDto {
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
        description: 'Приложение (колонка app).',
        type: String,
        example: 'event-sales',
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    app?: string;

    @ApiPropertyOptional({
        description: 'Окружение (NODE_ENV приложения).',
        type: String,
        example: 'production',
    })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    env?: string;

    @ApiPropertyOptional({
        description: 'Уровень записи.',
        type: String,
        enum: LOG_QUERY_LEVELS,
        example: 'error',
    })
    @IsOptional()
    @IsString()
    @IsIn(LOG_QUERY_LEVELS as unknown as string[])
    level?: LogQueryLevel;

    @ApiPropertyOptional({
        description:
            'Портал: domain в meta записи или адрес портала в тексте сообщения.',
        type: String,
        example: 'april-garant.bitrix24.ru',
    })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    domain?: string;

    @ApiPropertyOptional({
        description: 'Подстрока текста сообщения без учёта регистра.',
        type: String,
        example: 'Access denied',
    })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    search?: string;
}

export class LogsRowsQueryDto extends LogsQueryDto {
    @ApiPropertyOptional({
        description: 'Сколько последних строк вернуть: до 500.',
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

export class LogRowDto implements LogRowView {
    @ApiProperty({
        description: 'Время записи, ISO UTC.',
        type: String,
        example: '2026-10-26T15:04:05.123000Z',
    })
    at: string;

    @ApiProperty({
        description: 'Приложение.',
        type: String,
        example: 'event-sales',
    })
    app: string;

    @ApiProperty({
        description: 'Окружение.',
        type: String,
        example: 'production',
    })
    env: string;

    @ApiProperty({ description: 'Уровень.', type: String, example: 'error' })
    level: string;

    @ApiProperty({
        description: 'Контекст логгера (класс).',
        type: String,
        example: 'DealAuditScheduler',
    })
    context: string;

    @ApiProperty({
        description: 'Текст записи.',
        type: String,
        example: 'Аудит сделок упал',
    })
    message: string;

    @ApiProperty({
        description: 'Доп. поля записи (JSON строкой) или пусто.',
        type: String,
        example: '{"domain":"gsr.bitrix24.ru"}',
    })
    meta: string;

    @ApiProperty({
        description: 'Стек ошибки (до 4000 символов) или пусто.',
        type: String,
        example: '',
    })
    trace: string;

    @ApiProperty({
        description: 'Портал записи; пусто — не определён.',
        type: String,
        example: 'gsr.bitrix24.ru',
    })
    domain: string;
}

export class LogAppStatDto implements LogAppStat {
    @ApiProperty({
        description: 'Приложение.',
        type: String,
        example: 'event-sales',
    })
    app: string;

    @ApiProperty({ description: 'Ошибок за окно.', type: Number, example: 12 })
    errors: number;

    @ApiProperty({
        description: 'Предупреждений за окно.',
        type: Number,
        example: 40,
    })
    warnings: number;

    @ApiProperty({
        description: 'Всех записей за окно.',
        type: Number,
        example: 5200,
    })
    total: number;

    @ApiProperty({
        description: 'Ошибок за предыдущее такое же окно.',
        type: Number,
        example: 3,
    })
    prevErrors: number;

    @ApiProperty({
        description: 'Всех записей за предыдущее окно.',
        type: Number,
        example: 5100,
    })
    prevTotal: number;

    @ApiPropertyOptional({
        description: 'Последняя запись приложения, ISO UTC; null — нет.',
        type: String,
        nullable: true,
        example: '2026-10-26T15:04:05.123000Z',
    })
    lastAt: string | null;
}

export class LogErrorPatternDto implements LogErrorPattern {
    @ApiProperty({
        description: 'Приложение.',
        type: String,
        example: 'event-sales',
    })
    app: string;

    @ApiProperty({
        description: 'Пример текста ошибки.',
        type: String,
        example: 'Batch error: QUERY_LIMIT_EXCEEDED',
    })
    sample: string;

    @ApiProperty({
        description: 'Сколько раз за окно.',
        type: Number,
        example: 45,
    })
    count: number;

    @ApiProperty({
        description: 'Первая за окно, ISO UTC.',
        type: String,
        example: '2026-10-26T01:00:00.000000Z',
    })
    firstAt: string;

    @ApiProperty({
        description: 'Последняя, ISO UTC.',
        type: String,
        example: '2026-10-26T15:00:00.000000Z',
    })
    lastAt: string;

    @ApiProperty({
        description: 'Порталы, где встречалась (до 6).',
        type: [String],
        example: ['gsr.bitrix24.ru'],
    })
    domains: string[];
}

export class LogDomainStatDto implements LogDomainStat {
    @ApiProperty({
        description: 'Портал.',
        type: String,
        example: 'gsr.bitrix24.ru',
    })
    domain: string;

    @ApiProperty({ description: 'Ошибок за окно.', type: Number, example: 7 })
    errors: number;

    @ApiProperty({
        description: 'Предупреждений за окно.',
        type: Number,
        example: 20,
    })
    warnings: number;

    @ApiProperty({
        description: 'Всех записей за окно.',
        type: Number,
        example: 900,
    })
    total: number;
}

export class LogsRowsResponseDto {
    @ApiProperty({
        description: 'Последние строки по фильтру, новые сверху.',
        type: [LogRowDto],
    })
    rows: LogRowDto[];
}

export class LogsSummaryResponseDto implements LogSummary {
    @ApiProperty({ description: 'Окно в часах.', type: Number, example: 24 })
    hours: number;

    @ApiProperty({
        description: 'Начало окна, ISO UTC.',
        type: String,
        example: '2026-10-25T15:00:00.000Z',
    })
    from: string;

    @ApiProperty({
        description: 'Конец окна, ISO UTC.',
        type: String,
        example: '2026-10-26T15:00:00.000Z',
    })
    to: string;

    @ApiProperty({
        description:
            'Приложения: ошибки, предупреждения, сравнение с прошлым окном.',
        type: [LogAppStatDto],
    })
    apps: LogAppStatDto[];

    @ApiProperty({
        description: 'Повторяющиеся ошибки (текст без чисел — один шаблон).',
        type: [LogErrorPatternDto],
    })
    topErrors: LogErrorPatternDto[];

    @ApiProperty({
        description: 'Порталы с записями: где больше ошибок.',
        type: [LogDomainStatDto],
    })
    domains: LogDomainStatDto[];

    @ApiProperty({
        description:
            'Выводы словами: всплески, новые ошибки, замолчавшие приложения, частые ошибки, порталы.',
        type: [String],
        example: [
            'За 24 ч: ошибок 12, предупреждений 40, приложений с записями 5.',
        ],
    })
    conclusions: string[];
}
