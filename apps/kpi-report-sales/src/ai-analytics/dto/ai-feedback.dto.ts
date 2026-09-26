import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsIn,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';
import {
    AI_ANALYTICS_USER_FEEDBACK_KINDS,
    type AiAnalyticsUserFeedbackKind,
} from '../constants/ai-feedback.const';
import { AiRequestBaseDto } from './ai-request-base.dto';
import { AiAnalyticsEnvelopeDto } from './ai-response-envelope.dto';

/**
 * Обратная связь по витрине (план, контракт 4): реакция пользователя на
 * пульс/повестку/звонок пишется в ais записью type = ai-analytics-feedback.
 * Служебные виды (alert_sent, digest_sent, agenda_sent, rop_mark) ручка не
 * принимает — их пишут только push-контур, алерты и слепая проверка.
 */
export class AiFeedbackRequestDto extends AiRequestBaseDto {
    @ApiProperty({
        description:
            'Вид реакции пользователя: view, useful, not_useful, disagree, ' +
            'alert_handled. Служебные виды (alert_sent, digest_sent, ' +
            'agenda_sent, rop_mark) отклоняются валидацией с 400. ' +
            'alert_handled — только руководителям (менеджеру — 403). ' +
            'useful / not_useful — одна оценка на автора, объект и день ' +
            'портала: та же оценка возвращает id прежней записи, смена ' +
            'оценки пишет новую, прежняя уходит в superseded. Повтор ' +
            'alert_handled за день возвращает id прежней записи.',
        type: String,
        enum: AI_ANALYTICS_USER_FEEDBACK_KINDS,
        example: 'disagree',
    })
    @IsString()
    @IsIn(AI_ANALYTICS_USER_FEEDBACK_KINDS)
    kind: AiAnalyticsUserFeedbackKind;

    @ApiProperty({
        description:
            'Объект реакции: pulse, agenda, call:<id>, section:<code>.',
        type: String,
        example: 'call:1024',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    object: string;

    @ApiPropertyOptional({
        description:
            'Bitrix-id менеджера, к которому относится реакция. Менеджер ' +
            'без роли руководителя может указать только себя.',
        type: String,
        example: '512',
    })
    @IsOptional()
    @IsString()
    managerId?: string;

    @ApiPropertyOptional({
        description: 'Id транскрипции звонка, если реакция про звонок.',
        type: String,
        example: '1024',
    })
    @IsOptional()
    @IsString()
    transcriptionId?: string;

    @ApiPropertyOptional({
        description: 'Причина (для disagree/not_useful).',
        type: String,
        example: 'Возражение было отработано, разбор ошибся',
    })
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    reason?: string;

    @ApiPropertyOptional({
        description: 'Произвольный контекст реакции (объект).',
        type: Object,
    })
    @IsOptional()
    @IsObject()
    payload?: Record<string, unknown>;
}

export class AiFeedbackResultDto {
    @ApiProperty({
        description:
            'Id записи ais; для повторной реакции того же дня — id уже ' +
            'существующей записи (дубль не пишется).',
        type: String,
        example: '9001',
    })
    id: string;
}

export class AiFeedbackResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiPropertyOptional({
        description: 'Результат записи.',
        type: AiFeedbackResultDto,
    })
    data?: AiFeedbackResultDto;
}
