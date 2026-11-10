/**
 * DTO ручки `POST admin/ai-analytics/facts-catchup` (этап B4): запуск
 * догона фактов v3.1 в старых разборах и ответ постановки джобы.
 * Статус — `ai-analytics-facts-catchup-status.dto.ts`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import type { FactsCatchupRunResult } from '../services/ai-analytics-facts-catchup.service';
import { AiAnalyticsReanalyzePeriodDto } from './ai-analytics-reanalyze.dto';

/** Запуск догона фактов: домен и период — как у переразбора. */
export class AiAnalyticsFactsCatchupRunDto extends AiAnalyticsReanalyzePeriodDto {
    @ApiPropertyOptional({
        description:
            'Квота звонков на одну часть прогона (1..2000); не задана — ' +
            'значение по умолчанию. Остаток кандидатов джоба дорабатывает ' +
            'продолжениями сама.',
        example: 500,
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
            'Без вызовов модели: только подсчёт разборов без фактов и ' +
            'оценка стоимости в запись статуса.',
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

/** Ответ запуска догона фактов. */
export class AiAnalyticsFactsCatchupRunResultDto
    implements FactsCatchupRunResult
{
    @ApiProperty({
        description: 'Домен портала.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Начало периода, YYYY-MM-DD.',
        example: '2026-10-01',
        type: String,
    })
    from: string;

    @ApiProperty({
        description: 'Конец периода, YYYY-MM-DD.',
        example: '2026-10-31',
        type: String,
    })
    to: string;

    @ApiProperty({
        description: 'Запущен подсчёт без модели (dryRun) или боевой прогон.',
        example: false,
        type: Boolean,
    })
    dryRun: boolean;

    @ApiProperty({
        description:
            'Поставлена ли джоба CALL_REPORT_FACTS_CATCHUP в очередь CALL_REPORT.',
        example: true,
        type: Boolean,
    })
    dispatched: boolean;

    @ApiProperty({
        description:
            'Идентификатор джобы первой части (домен, период, режим); ' +
            'null — не поставлена.',
        example:
            'call-report-facts-catchup:gsr.bitrix24.ru:2026-10-01:2026-10-31:run:part-1',
        type: String,
        nullable: true,
    })
    jobId: string | null;

    @ApiProperty({
        description:
            'Причина отказа: очередь не подключена или пустой период; ' +
            'null — джоба поставлена.',
        example: null,
        type: String,
        nullable: true,
    })
    reason: string | null;

    @ApiProperty({
        description: 'Квота звонков на часть, с которой поставлена джоба.',
        example: 500,
        type: Number,
    })
    quota: number;
}
