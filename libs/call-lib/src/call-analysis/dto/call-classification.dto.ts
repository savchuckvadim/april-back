import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator';
import {
    CALL_REPORT_CALL_TYPE_CODES,
    CALL_REPORT_INTERLOCUTOR_CODES,
    CallReportCallTypeCode,
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
            'Тип звонка по закрытому справочнику смарта: cold (холодный, выход ' +
            'на ЛПР), call (цель — презентация), presentation (презентация), ' +
            'decision (звонок по решению), payment (звонок по оплате), other.',
        enum: CALL_REPORT_CALL_TYPE_CODES,
        example: 'cold',
    })
    @IsString()
    @IsIn(CALL_REPORT_CALL_TYPE_CODES as unknown as string[])
    callType: CallReportCallTypeCode;

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
