import { ApiProperty } from '@nestjs/swagger';
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
