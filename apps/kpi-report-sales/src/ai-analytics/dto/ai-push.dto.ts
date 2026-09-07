import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    ArrayMaxSize,
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    Matches,
    Min,
} from 'class-validator';
import {
    AI_ANALYTICS_PUSH_KINDS,
    AI_ANALYTICS_PUSH_STATUSES,
    AiAnalyticsPushKind,
    AiAnalyticsPushReason,
    AiAnalyticsPushStatus,
} from '../constants/ai-analytics.const';
import { AiRequestBaseDto } from './ai-request-base.dto';
import { AiAnalyticsEnvelopeDto } from './ai-response-envelope.dto';

/** Дата YYYY-MM-DD. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Payload Bull-джобы push-рассылки (внутренний контракт scheduler →
 * processor, валидаторы не нужны). date — день запуска в TZ портала:
 * часть jobId (дедуп) и опора расчёта периода.
 */
export interface AiPushJobData {
    domain: string;
    kind: AiAnalyticsPushKind;
    date: string;
}

/** Ручной запуск рассылки (руководители): тот же код, что у крона. */
export class AiPushRequestDto extends AiRequestBaseDto {
    @ApiProperty({
        description:
            'Что отправить: agenda — повестка планёрки РОПам (3 звонка текущей ' +
            'ISO-недели), digest — утренний разбор каждому менеджеру за ' +
            'вчерашний рабочий день, digest_all — один сводный дайджест по ' +
            'всем менеджерам портала (по отделам, до 3 звонков на менеджера, ' +
            'итог «кому что») адресатам из ai_analytics_digest_all_user_ids; ' +
            'сводный не зависит от ai_analytics_digest_enabled.',
        enum: AI_ANALYTICS_PUSH_KINDS,
        example: 'agenda',
    })
    @IsIn(AI_ANALYTICS_PUSH_KINDS)
    kind: AiAnalyticsPushKind;

    @ApiPropertyOptional({
        description:
            'День запуска (YYYY-MM-DD, TZ портала) — «как если бы крон ' +
            'сработал в этот день». По умолчанию сегодня.',
        type: String,
        example: '2026-09-07',
    })
    @IsOptional()
    @Matches(DATE_PATTERN, { message: 'date должен быть в формате YYYY-MM-DD' })
    date?: string;

    @ApiPropertyOptional({
        description:
            'Кому отправить ВМЕСТО получателей по настройкам (bitrix-id). ' +
            'Для теста «отправить себе»: повестка уйдёт указанным вместо РОПов, ' +
            'дайджест каждого менеджера — указанным вместо самих менеджеров, ' +
            'сводный дайджест — указанным вместо адресатов из настроек. ' +
            'Настройки портала и отметки доставки (*_sent) при этом не трогаются.',
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

/** Итог рассылки. */
export class AiPushResultDto {
    @ApiProperty({
        description: 'Вид рассылки.',
        enum: AI_ANALYTICS_PUSH_KINDS,
    })
    kind: AiAnalyticsPushKind;

    @ApiProperty({
        description: 'День запуска (YYYY-MM-DD, TZ портала).',
        type: String,
        example: '2026-09-07',
    })
    date: string;

    @ApiProperty({
        description:
            'sent — доставлено хотя бы одному; skipped — не отправлялось ' +
            '(см. reason); failed — ни одному не доставлено.',
        enum: AI_ANALYTICS_PUSH_STATUSES,
        example: 'sent',
    })
    status: AiAnalyticsPushStatus;

    @ApiProperty({
        description:
            'Причина пропуска/сбоя: disabled, digest-disabled, no-recipients, ' +
            'already-sent, empty, not-workday, not-delivered; null при sent.',
        type: String,
        nullable: true,
        example: null,
    })
    reason: AiAnalyticsPushReason | null;

    @ApiProperty({
        description: 'Bitrix-id получателей, которым уведомление доставлено.',
        type: [Number],
        example: [447],
    })
    delivered: number[];
}

export class AiPushResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiPropertyOptional({
        description: 'Итог рассылки (при status = ready).',
        type: AiPushResultDto,
    })
    data?: AiPushResultDto;
}
