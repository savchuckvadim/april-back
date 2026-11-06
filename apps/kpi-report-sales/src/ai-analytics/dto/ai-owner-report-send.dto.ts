import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, Min } from 'class-validator';
import {
    OWNER_REPORT_PERIOD_KINDS,
    type OwnerReportPeriodKind,
} from '@lib/sales-ai-analytics';
import {
    OWNER_REPORT_DELIVERY_REASONS,
    OWNER_REPORT_DELIVERY_STATUSES,
    type OwnerReportDeliveryReason,
    type OwnerReportDeliveryResult,
    type OwnerReportDeliveryStatus,
} from '../owner-report/owner-report-delivery.types';
import { AiOwnerReportRequestDto } from './ai-owner-report.dto';
import { AiAnalyticsEnvelopeDto } from './ai-response-envelope.dto';

/** Runtime-список причин для Swagger — выводится из OWNER_REPORT_DELIVERY_REASONS, без дублирования. */
const OWNER_REPORT_DELIVERY_REASON_VALUES = Object.values(
    OWNER_REPORT_DELIVERY_REASONS,
) satisfies readonly OwnerReportDeliveryReason[];

/** Ручной выпуск отчёта: получатели из запроса вместо настроек портала. */
export class AiOwnerReportSendRequestDto extends AiOwnerReportRequestDto {
    @ApiPropertyOptional({
        description:
            'Bitrix-id получателей личных сообщений (тест «отправить себе»). ' +
            'Пусто — получатели из настройки ai_analytics_owner_report_user_ids; ' +
            'при явном списке режим «только считать» не действует.',
        type: [Number],
        example: [447],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(20)
    @IsInt({ each: true })
    @Min(1, { each: true })
    recipients?: number[];
}

/** Итог выпуска. */
export class AiOwnerReportDeliveryResultDto
    implements OwnerReportDeliveryResult
{
    @ApiProperty({
        description:
            'Вид периода, за который выпущен отчёт: месяц, квартал, полугодие, год.',
        enum: OWNER_REPORT_PERIOD_KINDS,
        example: 'month',
    })
    kind: OwnerReportPeriodKind;

    @ApiProperty({
        description:
            'Ключ выпущенного периода: месяц — ГГГГ-ММ, квартал — ГГГГ-Q1…Q4, ' +
            'полугодие — ГГГГ-H1/H2, год — ГГГГ.',
        type: String,
        example: '2026-10',
    })
    periodKey: string;

    @ApiProperty({
        description:
            'Статус выпуска: sent — доставлено; dry_run — «только считать», ' +
            'сообщения не ушли; skipped — выпуск пропущен (см. reason); ' +
            'failed — никому не доставлено.',
        enum: OWNER_REPORT_DELIVERY_STATUSES,
        example: 'sent',
    })
    status: OwnerReportDeliveryStatus;

    @ApiProperty({
        description:
            'Причина пропуска или сбоя: ai-analytics-disabled — AI-аналитика ' +
            'на портале выключена; disabled — выпуск отчёта выключен в настройках ' +
            '(при явных recipients не действует); no-recipients — получатели ' +
            'не заданы; not-delivered — ни одно сообщение не доставлено. ' +
            'null — при sent и dry_run.',
        type: String,
        enum: OWNER_REPORT_DELIVERY_REASON_VALUES,
        nullable: true,
        example: null,
    })
    reason: OwnerReportDeliveryReason | null;

    @ApiProperty({
        description:
            'Bitrix-id сотрудников, которым сообщение доставлено; пусто при ' +
            'dry_run, skipped и failed.',
        type: [Number],
        example: [447],
    })
    delivered: number[];

    @ApiProperty({
        description:
            'Ссылка на PDF отчёта на Диске портала; null — файл не загружался ' +
            '(выпуск пропущен) или загрузка не удалась.',
        type: String,
        nullable: true,
        example:
            'https://april.bitrix24.ru/disk/showFile/12345/?&ncc=1&filename=owner-report-2026-10.pdf',
    })
    fileUrl: string | null;
}

/** Конверт ответа ручки ручного выпуска отчёта собственнику. */
export class AiOwnerReportSendResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiPropertyOptional({
        type: AiOwnerReportDeliveryResultDto,
        description:
            'Итог выпуска (при status = ready): статус доставки, причина ' +
            'пропуска, кому доставлено и ссылка на PDF.',
    })
    data?: AiOwnerReportDeliveryResultDto;
}
