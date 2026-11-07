import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsIn,
    IsOptional,
    IsString,
    Matches,
} from 'class-validator';
import {
    OWNER_REPORT_PERIOD_KINDS,
    type OwnerReportPeriodKind,
} from '@lib/sales-ai-analytics';
import { AiOwnerReportTextDto } from './ai-owner-report-text.dto';
import { AiRequestBaseDto } from './ai-request-base.dto';
import { AiAnalyticsEnvelopeDto } from './ai-response-envelope.dto';

const PERIOD_KEY_PATTERN = /^\d{4}(-(0[1-9]|1[0-2]|Q[1-4]|H[12]))?$/;

/** Запрос отчёта собственнику: вид периода и его ключ. */
export class AiOwnerReportRequestDto extends AiRequestBaseDto {
    @ApiProperty({
        description: 'Вид периода: месяц, квартал, полугодие, год.',
        enum: OWNER_REPORT_PERIOD_KINDS,
        example: 'month',
    })
    @IsString()
    @IsIn(OWNER_REPORT_PERIOD_KINDS as unknown as string[])
    kind: OwnerReportPeriodKind;

    @ApiPropertyOptional({
        description:
            'Ключ периода: месяц — ГГГГ-ММ, квартал — ГГГГ-Q1…Q4, полугодие — ' +
            'ГГГГ-H1/H2, год — ГГГГ. Пусто — последний закрытый период.',
        type: String,
        example: '2026-10',
    })
    @IsOptional()
    @IsString()
    @Matches(PERIOD_KEY_PATTERN, {
        message: 'periodKey: ГГГГ-ММ, ГГГГ-Q1, ГГГГ-H1 или ГГГГ',
    })
    periodKey?: string;

    @ApiPropertyOptional({
        description:
            'ID WebSocket-соединения клиента: по готовности придёт событие ' +
            'ai-analytics:owner-report:done (ошибка — ai-analytics:owner-report:error).',
        type: String,
        example: 'sock_abc123',
    })
    @IsOptional()
    @IsString()
    socketId?: string;

    @ApiPropertyOptional({
        description:
            'Собрать отчёт заново, игнорируя кэш и снапшот; результат перезапишет их.',
        type: Boolean,
        default: false,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    forceRefresh?: boolean;
}

/** Отчёт собственнику за период. */
export class AiOwnerReportDto {
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
        description: 'Первый день периода (TZ портала).',
        type: String,
        example: '2026-10-01',
    })
    from: string;

    @ApiProperty({
        description: 'Последний день периода (TZ портала).',
        type: String,
        example: '2026-10-31',
    })
    to: string;

    @ApiProperty({
        description: 'Момент формирования, ISO.',
        type: String,
        example: '2026-11-02T06:05:00.000Z',
    })
    generatedAt: string;

    @ApiProperty({
        description:
            'Писала ли модель хотя бы одну часть (резюме, утечки, сотрудники).',
        enum: ['template', 'model'],
        example: 'model',
    })
    source: 'template' | 'model';

    @ApiPropertyOptional({
        description: 'Почему модель не писала; null — писала или пробовала.',
        type: String,
        nullable: true,
        example: null,
    })
    narrativeReason: string | null;

    @ApiProperty({
        type: AiOwnerReportTextDto,
        description: 'Текст отчёта по разделам.',
    })
    text: AiOwnerReportTextDto;

    @ApiProperty({
        type: [String],
        description:
            'Ключи периодов этого вида, по которым уже есть отчёт (новые первыми).',
        example: ['2026-10', '2026-09'],
    })
    availablePeriods: string[];
}

/** Конверт ответа ручки отчёта собственнику. */
export class AiOwnerReportResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiPropertyOptional({
        description:
            'Отчёт (при status = ready). При queued/processing результат придёт ' +
            'по WS ai-analytics:owner-report:done, затем повторить POST.',
        type: AiOwnerReportDto,
    })
    data?: AiOwnerReportDto;
}
