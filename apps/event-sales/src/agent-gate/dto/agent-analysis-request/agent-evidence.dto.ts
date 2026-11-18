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
    FIVE_K_ITEM_KEYS,
    HVOST_STEP_KEYS,
    type FiveKItemKey,
    type HvostStepKey,
} from '@lib/call-lib';

/**
 * Места в разговоре у потребностей и пунктов чек-листов (задание
 * focus-v3.4): дословная цитата из расшифровки и секунда её начала. По ним
 * страница разбора ставит кнопку «Показать в разговоре». Секунду проверяет
 * приём разбора по расшифровке: не подтвердилась — null.
 */

/** Ключи пунктов «хвоста» и 5К — одним списком для проверки. */
export const CHECKLIST_EVIDENCE_KEYS = [
    ...HVOST_STEP_KEYS,
    ...FIVE_K_ITEM_KEYS,
] as const;
export type ChecklistEvidenceKey = HvostStepKey | FiveKItemKey;

/** Потребность клиента с местом в разговоре. */
export class AgentNeedItemDto {
    @ApiProperty({
        description: 'Потребность клиента коротко, своими словами.',
        example: 'Отслеживать изменения в налоговом законодательстве',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    need: string;

    @ApiPropertyOptional({
        description:
            'Дословная реплика из расшифровки, где потребность прозвучала; ' +
            'null — реплику не нашли.',
        example: 'нам главное — не пропускать изменения по НДС',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    quote?: string | null;

    @ApiPropertyOptional({
        description:
            'Секунда начала реплики в записи; null — меток нет или время ' +
            'не подтвердилось по расшифровке.',
        example: 134,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    startSec?: number | null;
}

/** Место пункта «хвоста» или 5К, раскрытого в разговоре. */
export class AgentChecklistEvidenceDto {
    @ApiProperty({
        description:
            'Ключ пункта: «хвост» — desire, offered, priceReaction, ' +
            'decisionProcess, decisionWay; 5К — client, company, colleagues, ' +
            'competitor, criteria.',
        enum: CHECKLIST_EVIDENCE_KEYS,
        example: 'priceReaction',
    })
    @IsIn(CHECKLIST_EVIDENCE_KEYS)
    key: ChecklistEvidenceKey;

    @ApiProperty({
        description: 'Дословная реплика из расшифровки, где тема прозвучала.',
        example: 'двенадцать тысяч в месяц — это для нас дороговато',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    quote: string;

    @ApiPropertyOptional({
        description:
            'Секунда начала реплики в записи; null — меток нет или время ' +
            'не подтвердилось по расшифровке.',
        example: 412,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    startSec?: number | null;
}
