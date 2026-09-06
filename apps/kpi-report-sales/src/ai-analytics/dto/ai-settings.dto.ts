import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    AI_ANALYTICS_BUCKETS,
    AI_ANALYTICS_TONES,
    AiAnalyticsBucket,
    AiAnalyticsTone,
    CALL_REPORT_CALL_TYPE_CODES,
    CallReportCallTypeCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { AiRequestBaseDto } from './ai-request-base.dto';
import { AiAnalyticsEnvelopeDto } from './ai-response-envelope.dto';
import { ReadinessDto } from './readiness.dto';

/** Запрос настроек витрины. */
export class AiSettingsGetRequestDto extends AiRequestBaseDto {}

/** Тип звонка из карты алфавитов AI_ANALYTICS_EVENT_KINDS (подвкладка). */
export class AiCallTypeDto {
    @ApiProperty({
        description: 'Код AI-типа звонка (классификатор разбора).',
        enum: CALL_REPORT_CALL_TYPE_CODES,
        example: 'presentation',
    })
    code: CallReportCallTypeCode;

    @ApiProperty({
        description: 'Подпись подвкладки/столбца.',
        type: String,
        example: 'Презентация',
    })
    title: string;

    @ApiProperty({
        description: 'Тон UI (реестр tones пакета april-ui).',
        enum: AI_ANALYTICS_TONES,
        example: 'event-pres',
    })
    tone: AiAnalyticsTone;

    @ApiProperty({
        description:
            'Корзина оценок (contact/presentation/closing); null — тип не ' +
            'участвует в оценках.',
        enum: AI_ANALYTICS_BUCKETS,
        nullable: true,
        example: 'presentation',
    })
    bucket: AiAnalyticsBucket | null;

    @ApiProperty({
        description:
            'Главный KPI-код event_type для заголовочной цифры; null — нет.',
        type: String,
        nullable: true,
        example: 'presentation_uniq',
    })
    kpiPrimaryEventTypeCode: string | null;
}

/** Настройки и готовность витрины (план, 6.2). */
export class AiAnalyticsSettingsDto {
    @ApiProperty({
        description:
            'AI-аналитика ОП включена на портале (ai_analytics_enabled).',
        type: Boolean,
        example: true,
    })
    enabled: boolean;

    @ApiProperty({
        description:
            'Есть ли разборы звонков за последние 30 дней (конвейер работает). ' +
            'false при enabled → режим kpi-only.',
        type: Boolean,
        example: true,
    })
    pipelineEnabled: boolean;

    @ApiProperty({
        description:
            'Аудит и калибровка данных по порталу разрешены ' +
            '(ai_analytics_audit_enabled): админ-ручка аудита и месячный ' +
            'снапшот. Не зависит от enabled.',
        type: Boolean,
        example: false,
    })
    auditEnabled: boolean;

    @ApiProperty({
        description: 'Алерты РОПу в день звонка включены.',
        type: Boolean,
        example: false,
    })
    alertsEnabled: boolean;

    @ApiProperty({
        description: 'Утренний разбор менеджерам включён.',
        type: Boolean,
        example: false,
    })
    digestEnabled: boolean;

    @ApiProperty({ description: 'Готовность витрины.', type: ReadinessDto })
    readiness: ReadinessDto;

    @ApiProperty({
        description: 'Типы звонков (подвкладки) из карты алфавитов.',
        type: [AiCallTypeDto],
    })
    callTypes: AiCallTypeDto[];

    @ApiProperty({
        description:
            'Дата (YYYY-MM-DD), с которой разборы сопоставимы по версиям; пусто — нет данных.',
        type: String,
        example: '2026-09-05',
    })
    comparableFrom: string;

    @ApiProperty({
        description: 'Bitrix-id РОПов (ai_analytics_rop_user_ids).',
        type: [Number],
        example: [447, 512],
    })
    ropUserIds: number[];
}

export class AiSettingsResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiPropertyOptional({
        description: 'Настройки и готовность (при status = ready).',
        type: AiAnalyticsSettingsDto,
    })
    data?: AiAnalyticsSettingsDto;
}
