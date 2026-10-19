import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsIn,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import {
    CALL_REPORT_RISK_FLAG_CODES,
    CallReportRiskFlagCode,
} from '@lib/call-lib';

/**
 * Доказательство риск-флага (решение владельца 19.10.2026): флаг без
 * дословной цитаты разбор не принимает — приём снимает его из riskFlags.
 * Таймкоды — как у возражений (метки [mm:ss] расшифровки, П6).
 */

/** Чья реплика приведена в доказательстве. */
export const AGENT_RISK_EVIDENCE_SPEAKERS = ['manager', 'client'] as const;
export type AgentRiskEvidenceSpeaker =
    (typeof AGENT_RISK_EVIDENCE_SPEAKERS)[number];

/** Цитата-доказательство одного риск-флага. */
export class AgentRiskEvidenceDto {
    @ApiProperty({
        description:
            'Код риск-флага, который подтверждает цитата (справочник ' +
            'RISK_FLAGS смарта «AI-анализ звонков»).',
        enum: CALL_REPORT_RISK_FLAG_CODES,
        example: 'conflict',
    })
    @IsString()
    @IsIn(CALL_REPORT_RISK_FLAG_CODES as unknown as string[])
    flag: CallReportRiskFlagCode;

    @ApiProperty({
        description:
            'Дословная реплика из расшифровки, по которой поставлен флаг. ' +
            'Пустая цитата — доказательства нет, флаг снимается.',
        example: 'Да вы вообще слушаете, что я говорю?',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    quote: string;

    @ApiPropertyOptional({
        description:
            'Секунда начала цитаты по расшифровке с таймкодами; null — ' +
            'меток в расшифровке не было.',
        type: Number,
        nullable: true,
        example: 134,
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    startSec?: number | null;

    @ApiPropertyOptional({
        description: 'Секунда конца цитаты; null — меток не было.',
        type: Number,
        nullable: true,
        example: 141,
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    endSec?: number | null;

    @ApiProperty({
        description:
            'Чья реплика: manager — менеджер (конфликт, обещание, ' +
            'регламент, закрытая дверь), client — клиент (сильный негатив).',
        enum: AGENT_RISK_EVIDENCE_SPEAKERS,
        example: 'manager',
    })
    @IsString()
    @IsIn(AGENT_RISK_EVIDENCE_SPEAKERS as unknown as string[])
    speaker: AgentRiskEvidenceSpeaker;
}
