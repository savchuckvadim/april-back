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
    AI_ANALYTICS_FEEDBACK_KINDS,
    AiAnalyticsFeedbackKind,
} from '@lib/sales-ai-analytics';
import { AiRequestBaseDto } from './ai-request-base.dto';
import { AiAnalyticsEnvelopeDto } from './ai-response-envelope.dto';

/**
 * Обратная связь по витрине (план, контракт 4): реакция пользователя на
 * пульс/повестку/звонок пишется в ais записью type = ai-analytics-feedback.
 */
export class AiFeedbackRequestDto extends AiRequestBaseDto {
    @ApiProperty({
        description:
            'Вид реакции: view, useful, not_useful, disagree, alert_handled ' +
            '(остальные виды — служебные, пишет push-контур).',
        enum: AI_ANALYTICS_FEEDBACK_KINDS,
        example: 'disagree',
    })
    @IsIn(AI_ANALYTICS_FEEDBACK_KINDS)
    kind: AiAnalyticsFeedbackKind;

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
        description: 'Id записи ais.',
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
