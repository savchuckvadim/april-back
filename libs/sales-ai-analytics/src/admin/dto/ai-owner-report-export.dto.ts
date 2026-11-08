/**
 * DTO выгрузки PDF отчёта собственнику из админки
 * (`admin/ai-analytics/owner-report-export`): запуск, запрос состояния и
 * файла, состояние выгрузки.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
    IsBoolean,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';
import {
    OWNER_REPORT_EXPORT_STATUSES,
    type OwnerReportExportState,
    type OwnerReportExportStatus,
} from '../../contracts/owner-report-export.types';
import { OWNER_REPORT_PERIOD_KINDS } from '../../model/owner-report/owner-report.period';
import type { OwnerReportPeriodKind } from '../../model/owner-report/owner-report.types';

const trimLower = ({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value;

const toBoolean = ({ value }: { value: unknown }): unknown =>
    value === 'true' ? true : value === 'false' ? false : value;

/** Портал и период выгрузки — общее у запуска, состояния и файла. */
export class AiOwnerReportExportTargetDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty({ message: 'domain обязателен' })
    @Transform(trimLower)
    domain: string;

    @ApiProperty({
        description:
            'Вид периода: month — месяц, quarter — квартал, half_year — полугодие, year — год.',
        enum: OWNER_REPORT_PERIOD_KINDS,
        example: 'month',
    })
    @IsIn(OWNER_REPORT_PERIOD_KINDS)
    kind: OwnerReportPeriodKind;

    @ApiProperty({
        description:
            'Ключ закрытого периода: месяц — ГГГГ-ММ, квартал — ГГГГ-Q1…Q4, полугодие — ГГГГ-H1/H2, год — ГГГГ.',
        example: '2026-10',
        type: String,
    })
    @IsString()
    @MaxLength(10)
    periodKey: string;
}

/** Запуск выгрузки. */
export class AiOwnerReportExportStartDto extends AiOwnerReportExportTargetDto {
    @ApiPropertyOptional({
        description:
            'Пересобрать отчёт заново (после переразбора звонков), а не брать готовый. По умолчанию — нет.',
        type: Boolean,
        example: true,
    })
    @IsOptional()
    @Transform(toBoolean)
    @IsBoolean()
    forceRefresh?: boolean;
}

/** Состояние выгрузки. */
export class AiOwnerReportExportStateDto implements OwnerReportExportState {
    @ApiProperty({
        description:
            'queued — в очереди, processing — собирается, ready — PDF готов, error — ошибка.',
        enum: OWNER_REPORT_EXPORT_STATUSES,
        example: 'ready',
    })
    status: OwnerReportExportStatus;

    @ApiProperty({ description: 'Домен портала.', type: String })
    domain: string;

    @ApiProperty({
        description: 'Вид периода.',
        enum: OWNER_REPORT_PERIOD_KINDS,
        example: 'month',
    })
    kind: OwnerReportPeriodKind;

    @ApiProperty({
        description: 'Ключ периода.',
        type: String,
        example: '2026-10',
    })
    periodKey: string;

    @ApiProperty({
        description: 'Имя файла готового PDF; до готовности — null.',
        type: String,
        nullable: true,
        example: 'sales-report-month-2026-10.pdf',
    })
    filename: string | null;

    @ApiProperty({
        description: 'Размер PDF в байтах; до готовности — null.',
        type: Number,
        nullable: true,
        example: 88000,
    })
    sizeBytes: number | null;

    @ApiProperty({
        description: 'Текст ошибки; без ошибки — null.',
        type: String,
        nullable: true,
    })
    message: string | null;

    @ApiProperty({
        description: 'Время последней смены состояния, ISO.',
        type: String,
        example: '2026-11-07T12:00:00.000Z',
    })
    updatedAt: string;
}

/** Ответ на запрос состояния: выгрузки не было — state = null. */
export class AiOwnerReportExportStatusResponseDto {
    @ApiProperty({
        description:
            'Состояние выгрузки; не запускали или прошли сутки — null.',
        type: AiOwnerReportExportStateDto,
        nullable: true,
    })
    state: AiOwnerReportExportStateDto | null;
}
