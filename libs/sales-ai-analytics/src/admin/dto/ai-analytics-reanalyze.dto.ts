/**
 * DTO ручки `POST admin/ai-analytics/reanalyze` (этап 1B плана
 * 2026-10-19-ai-focus-plan): запуск переразбора истории текущей версией
 * промпта и ответ постановки джобы. Статус — `ai-analytics-reanalyze-status.dto.ts`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import type { ReanalyzeRunResult } from '../services/ai-analytics-reanalyze.service';

const trimLower = ({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Дата портала YYYY-MM-DD. */
export const AI_ANALYTICS_REANALYZE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Верхняя граница списка сотрудников в одном запросе. */
export const AI_ANALYTICS_REANALYZE_USERS_MAX = 200;

/** Период дат портала и домен — общее у запуска и статуса. */
export class AiAnalyticsReanalyzePeriodDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24, чью историю переразбирать.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty({ message: 'domain обязателен' })
    @Transform(trimLower)
    domain: string;

    @ApiProperty({
        description:
            'Начало периода по дате звонка в поясе портала, YYYY-MM-DD, ' +
            'включительно.',
        example: '2026-09-01',
        type: String,
    })
    @IsString()
    @Matches(AI_ANALYTICS_REANALYZE_DATE_PATTERN, {
        message: 'from: ожидается YYYY-MM-DD',
    })
    from: string;

    @ApiProperty({
        description:
            'Конец периода по дате звонка в поясе портала, YYYY-MM-DD, ' +
            'включительно.',
        example: '2026-10-19',
        type: String,
    })
    @IsString()
    @Matches(AI_ANALYTICS_REANALYZE_DATE_PATTERN, {
        message: 'to: ожидается YYYY-MM-DD',
    })
    to: string;
}

/** Запуск переразбора истории. */
export class AiAnalyticsReanalyzeRunDto extends AiAnalyticsReanalyzePeriodDto {
    @ApiPropertyOptional({
        description:
            'Сотрудники (Bitrix-id), чьи звонки переразбирать. Не задано — ' +
            'пилот из настроек портала (allowedUserIds); если там пусто — ' +
            'все сотрудники.',
        example: [317],
        type: [Number],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(AI_ANALYTICS_REANALYZE_USERS_MAX)
    @IsInt({ each: true })
    @Min(1, { each: true })
    userIds?: number[];

    @ApiPropertyOptional({
        description:
            'Квота звонков на одну часть прогона (1..2000); не задана — ' +
            'значение по умолчанию. Остаток кандидатов джоба дорабатывает ' +
            'продолжениями сама.',
        example: 300,
        type: Number,
        minimum: 1,
        maximum: 2000,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(2000)
    quota?: number;

    @ApiPropertyOptional({
        description:
            'Без вызовов модели: только кандидаты по версиям и оценка ' +
            'стоимости в запись статуса.',
        example: true,
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    dryRun?: boolean;

    @ApiPropertyOptional({
        description:
            'IANA-пояс дат портала для границ периода; не задан — ' +
            'Europe/Moscow.',
        example: 'Asia/Yekaterinburg',
        type: String,
    })
    @IsOptional()
    @IsString()
    @MaxLength(64)
    timeZone?: string;
}

/** Ответ запуска переразбора. */
export class AiAnalyticsReanalyzeRunResultDto implements ReanalyzeRunResult {
    @ApiProperty({
        description: 'Домен портала.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Начало периода, YYYY-MM-DD.',
        example: '2026-09-01',
        type: String,
    })
    from: string;

    @ApiProperty({
        description: 'Конец периода, YYYY-MM-DD.',
        example: '2026-10-19',
        type: String,
    })
    to: string;

    @ApiProperty({
        description: 'Запущена оценка без модели (dryRun) или боевой прогон.',
        example: false,
        type: Boolean,
    })
    dryRun: boolean;

    @ApiProperty({
        description:
            'Поставлена ли джоба CALL_REPORT_REANALYZE в очередь CALL_REPORT.',
        example: true,
        type: Boolean,
    })
    dispatched: boolean;

    @ApiProperty({
        description:
            'Идентификатор джобы первой части (домен, период, режим); ' +
            'null — не поставлена.',
        example:
            'call-report-reanalyze:gsr.bitrix24.ru:2026-09-01:2026-10-19:run:part-1',
        type: String,
        nullable: true,
    })
    jobId: string | null;

    @ApiProperty({
        description:
            'Почему не запущено: очередь недоступна или период пустой; ' +
            'null — запущено.',
        example: null,
        type: String,
        nullable: true,
    })
    reason: string | null;

    @ApiProperty({
        description: 'Квота звонков на часть, с которой уйдёт прогон.',
        example: 300,
        type: Number,
    })
    quota: number;
}
