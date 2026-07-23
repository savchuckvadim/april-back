import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsIn,
    IsISO8601,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import {
    CALL_REPORT_CALL_TYPE_CODES,
    CallReportCallTypeCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';

/** Виды отчётов модуля аналитики звонков (ключи кэша и истории). */
export const CALL_REPORT_ANALYTICS_KINDS = [
    'summary',
    'speech',
    'objections',
    'managers',
] as const;

export type CallReportAnalyticsKind =
    (typeof CALL_REPORT_ANALYTICS_KINDS)[number];

/**
 * Общий запрос построения отчёта: период обязателен, остальные фильтры
 * опциональны. Флаги useCache/saveToHistory управляют кэшем и историей.
 */
export class CallReportAnalyticsQueryDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24, по которому строится отчёт.',
        example: 'april-garant.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: 'Начало периода отчёта (ISO 8601, по времени звонка).',
        example: '2026-07-01T00:00:00.000Z',
        type: String,
    })
    @IsISO8601()
    from: string;

    @ApiProperty({
        description: 'Конец периода отчёта (ISO 8601, по времени звонка).',
        example: '2026-07-23T23:59:59.000Z',
        type: String,
    })
    @IsISO8601()
    to: string;

    @ApiPropertyOptional({
        description:
            'Bitrix-id менеджера (ответственного сделки) НА ЭТОМ ПОРТАЛЕ — ' +
            'НЕ id пользователя нашей БД. Id уникален только в связке с ' +
            'domain (на разных порталах id совпадают), поэтому фильтр всегда ' +
            'работает внутри обязательного domain. Звонки без сохранённого ' +
            'менеджера (обработанные до включения фичи) при фильтре ' +
            'отбрасываются — их число видно в meta.skippedNoManager.',
        example: '7',
        type: String,
    })
    @IsOptional()
    @IsString()
    managerId?: string;

    @ApiPropertyOptional({
        description: 'Минимальная длительность звонка, сек (включительно).',
        example: 300,
        type: Number,
        minimum: 0,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    minDurationSec?: number;

    @ApiPropertyOptional({
        description: 'Максимальная длительность звонка, сек (включительно).',
        example: 1800,
        type: Number,
        minimum: 0,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    maxDurationSec?: number;

    @ApiPropertyOptional({
        description:
            'Фильтр по типу звонка (коды CALL_TYPE смарта). Тип берётся из ' +
            'анализа агента, иначе — из дешёвого классификатора конвейера.',
        enum: CALL_REPORT_CALL_TYPE_CODES,
        example: 'cold',
    })
    @IsOptional()
    @IsString()
    @IsIn(CALL_REPORT_CALL_TYPE_CODES as unknown as string[])
    callType?: CallReportCallTypeCode;

    @ApiPropertyOptional({
        description:
            'Сохранить построенный отчёт в историю (таблица ais, ' +
            'type=report-<вид>). По умолчанию false.',
        example: false,
        type: Boolean,
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    saveToHistory?: boolean;

    @ApiPropertyOptional({
        description:
            'Использовать кэш (Redis): true — отдать кэшированный отчёт по ' +
            'тем же параметрам, если он свежий; false — пересчитать заново ' +
            '(кэш при этом обновляется). По умолчанию true.',
        example: true,
        type: Boolean,
        default: true,
    })
    @IsOptional()
    @IsBoolean()
    useCache?: boolean;
}

/** Запрос сброса кэша отчётов. Без полей — сброс всего кэша модуля. */
export class CallReportAnalyticsCacheResetDto {
    @ApiPropertyOptional({
        description: 'Сбросить кэш только этого домена.',
        example: 'april-garant.bitrix24.ru',
        type: String,
    })
    @IsOptional()
    @IsString()
    domain?: string;

    @ApiPropertyOptional({
        description:
            'Сбросить кэш только одного вида отчёта: summary / speech / ' +
            'objections / managers.',
        enum: CALL_REPORT_ANALYTICS_KINDS,
        example: 'summary',
    })
    @IsOptional()
    @IsString()
    @IsIn(CALL_REPORT_ANALYTICS_KINDS as unknown as string[])
    report?: CallReportAnalyticsKind;
}
