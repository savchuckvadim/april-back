import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InstallCallReportSmartResult } from '@lib/call-lib';
import { CallReportScanResult } from '../use-cases/call-report-scan.use-case';
import { CallReportPipelineResult } from '../use-cases/call-report-pipeline.use-case';

/** Результат установки смарт-процесса «AI-анализ звонков». */
export class InstallCallReportSmartResponseDto
    implements InstallCallReportSmartResult
{
    @ApiProperty({
        description: 'entityTypeId смарт-процесса на портале.',
        example: 128,
        type: Number,
    })
    entityTypeId: number;

    @ApiProperty({
        description:
            'true — тип создан этим вызовом; false — уже существовал (идемпотентный повтор).',
        example: true,
        type: Boolean,
    })
    created: boolean;

    @ApiProperty({
        description: 'UF-имена полей, добавленных этим вызовом.',
        example: ['UF_CRM_128_SUMMARY'],
        type: [String],
    })
    fieldsAdded: string[];

    @ApiProperty({
        description: 'UF-имена полей, которые уже существовали.',
        example: ['UF_CRM_128_ACTIVITY_ID'],
        type: [String],
    })
    fieldsExisting: string[];

    @ApiProperty({
        description: 'UF-имена полей, которые не удалось создать (см. логи).',
        example: [],
        type: [String],
    })
    fieldsFailed: string[];
}

/** Результат скана звонков домена. */
export class CallReportScanResponseDto implements CallReportScanResult {
    @ApiProperty({
        description: 'Домен портала, по которому выполнен скан.',
        example: 'april-garant.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description:
            'Сколько звонков вернул voximplant.statistic.get по фильтру (длительность + окно).',
        example: 14,
        type: Number,
    })
    found: number;

    @ApiProperty({
        description:
            'Сколько звонков уже обработано ранее (дедуп по dedup_key).',
        example: 9,
        type: Number,
    })
    alreadyProcessed: number;

    @ApiProperty({
        description:
            'Сколько звонков пропущено: активность принадлежит не сделке (lead/contact — вне MVP).',
        example: 2,
        type: Number,
    })
    skippedNonDeal: number;

    @ApiProperty({
        description: 'Сколько звонков пропущено из-за отсутствия аудиофайла.',
        example: 1,
        type: Number,
    })
    skippedNoAudio: number;

    @ApiProperty({
        description:
            'Сколько звонков пропущено: звонивший не входит в отдел продаж ' +
            '(bx-department; отключается env CALL_REPORT_SALES_ONLY=0).',
        example: 3,
        type: Number,
    })
    skippedNotSales: number;

    @ApiProperty({
        description: 'Сколько звонков поставлено в очередь на обработку.',
        example: 2,
        type: Number,
    })
    enqueued: number;
}

/** Результат синхронного анализа одного звонка. */
export class AnalyzeCallResponseDto implements CallReportPipelineResult {
    @ApiProperty({
        description: 'ID строки транскрипции в БД (transcriptions).',
        example: '42',
        type: String,
    })
    transcriptionId: string;

    @ApiProperty({
        description: 'Каким транскрибатором обработан звонок.',
        example: 'yandex',
        type: String,
    })
    provider: string;

    @ApiProperty({
        description: 'Сохранено ли GigaChat-резюме в ais.',
        example: true,
        type: Boolean,
    })
    resumeSaved: boolean;

    @ApiProperty({
        description: 'Сохранены ли GigaChat-рекомендации в ais.',
        example: true,
        type: Boolean,
    })
    recomendationSaved: boolean;

    @ApiProperty({
        description:
            'Тип звонка от дешёвого классификатора (cold / call / presentation / ' +
            'decision / payment / other); null — классификация выключена или не удалась.',
        example: 'cold',
        type: String,
        nullable: true,
    })
    callType: string | null;
}

/** Итог обработки одного звонка в пакетном /analyze. */
export class AnalyzeCallItemDto {
    @ApiProperty({
        description: 'ID активности-звонка.',
        example: 781614,
        type: Number,
    })
    activityId: number;

    @ApiProperty({
        description: 'ID сделки звонка.',
        example: 12345,
        type: Number,
    })
    dealId: number;

    @ApiProperty({
        description: 'Итог: done — обработан, error — ошибка (см. error).',
        enum: ['done', 'error'],
        example: 'done',
    })
    status: 'done' | 'error';

    @ApiPropertyOptional({
        description: 'ID строки транскрипции (при status=done).',
        example: '42',
        type: String,
    })
    transcriptionId?: string;

    @ApiPropertyOptional({
        description: 'Каким транскрибатором обработан звонок.',
        example: 'bitrix-vibecode',
        type: String,
    })
    provider?: string;

    @ApiPropertyOptional({
        description: 'Тип звонка от классификатора (null — не определён).',
        example: 'cold',
        type: String,
        nullable: true,
    })
    callType?: string | null;

    @ApiPropertyOptional({
        description: 'Сохранено ли резюме в ais.',
        example: true,
        type: Boolean,
    })
    resumeSaved?: boolean;

    @ApiPropertyOptional({
        description: 'Сохранены ли рекомендации в ais.',
        example: true,
        type: Boolean,
    })
    recomendationSaved?: boolean;

    @ApiPropertyOptional({
        description: 'Текст ошибки (при status=error).',
        example: 'No audio files in activity 781614',
        type: String,
    })
    error?: string;
}

/**
 * Результат /call-report/analyze: прямой режим (activityId) даёт один
 * элемент results; режим подбора (dealId/userId + limit) — до limit
 * элементов, обработанных синхронно по очереди.
 */
export class AnalyzeCallsResponseDto {
    @ApiProperty({
        description: 'Домен портала.',
        example: 'april-garant.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description:
            'Режим запуска: direct — по activityId, selection — подбор ' +
            'последних записей по dealId/userId.',
        enum: ['direct', 'selection'],
        example: 'selection',
    })
    mode: 'direct' | 'selection';

    @ApiProperty({
        description:
            'Сколько кандидатов нашлось в voximplant после фильтров ' +
            '(в direct-режиме всегда 1).',
        example: 6,
        type: Number,
    })
    found: number;

    @ApiProperty({
        description: 'Пропущено: уже обработаны ранее (данные уже в БД).',
        example: 2,
        type: Number,
    })
    skippedAlreadyProcessed: number;

    @ApiProperty({
        description: 'Пропущено: активность не принадлежит сделке.',
        example: 1,
        type: Number,
    })
    skippedNonDeal: number;

    @ApiProperty({
        description: 'Пропущено: у активности нет аудиозаписи.',
        example: 0,
        type: Number,
    })
    skippedNoAudio: number;

    @ApiProperty({
        description: 'Итоги обработки взятых в работу звонков.',
        type: [AnalyzeCallItemDto],
    })
    results: AnalyzeCallItemDto[];
}
