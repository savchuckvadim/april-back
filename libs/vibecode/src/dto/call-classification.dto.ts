import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
    Matches,
    Max,
    Min,
} from 'class-validator';
import {
    CALL_REPORT_INTERLOCUTOR_CODES,
    CallReportInterlocutorCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';

/**
 * Результат дешёвой классификации звонка (tier-1: VibeCode bitrixgpt).
 * Выполняется в начале конвейера call-report — тип звонка становится
 * управляющим параметром дальнейшего анализа (релевантность разделов,
 * набор знаний, речевые нормы) и попадает в pending-список agent-gate.
 */
export class CallClassificationResultDto {
    @ApiProperty({
        description:
            'Код типа звонка. Встроенные: cold (холодный, выход на ЛПР), call ' +
            '(цель — презентация), presentation, decision (по решению), ' +
            'payment (по оплате), other; реестр типов (kind call-type-registry) ' +
            'может добавлять общие и клиентские типы — поэтому валидация по ' +
            'формату кода, а допустимый набор enforcéится схемой классификатора.',
        example: 'cold',
        type: String,
    })
    @IsString()
    @Matches(/^[a-z][a-z0-9_-]*$/, {
        message: 'callType: слаг вида cold / renewal-call',
    })
    callType: string;

    @ApiProperty({
        description:
            'С кем говорили: lpr (ЛПР), user (пользователь, не ЛПР), ' +
            'secretary (секретарь), other.',
        enum: CALL_REPORT_INTERLOCUTOR_CODES,
        example: 'secretary',
    })
    @IsString()
    @IsIn(CALL_REPORT_INTERLOCUTOR_CODES as unknown as string[])
    interlocutorRole: CallReportInterlocutorCode;

    @ApiProperty({
        description:
            'Уверенность классификации 0–1. Низкая уверенность — кандидат ' +
            'на эскалацию более сильной модели.',
        example: 0.85,
        type: Number,
        minimum: 0,
        maximum: 1,
    })
    @IsNumber()
    @Min(0)
    @Max(1)
    confidence: number;

    @ApiPropertyOptional({
        description: 'Короткое обоснование классификации (1–2 предложения).',
        example: 'Менеджер пытается пройти секретаря, презентации не было.',
        type: String,
    })
    @IsOptional()
    @IsString()
    reason?: string;
}
