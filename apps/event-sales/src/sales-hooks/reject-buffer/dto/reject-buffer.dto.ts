import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    ArrayMinSize,
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import { SalesHookRunRequestBaseDto } from '../../core/dto/sales-hook-run-request.dto';

/** Что делать с открытыми задачами при отправке в буфер отказников. */
export const REJECT_BUFFER_TASK_MODES = ['complete', 'keep'] as const;
export type RejectBufferTaskMode = (typeof REJECT_BUFFER_TASK_MODES)[number];

/** Query-параметры вебхука робота «в буфер отказников». */
export class RejectBufferWebhookQueryDto {
    @ApiProperty({
        description:
            'Компания, чьи сделки отправляются в буфер отказников ' +
            '(основная — в «Отказ», остальные наши — в «не состоялось»).',
        example: 7,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    companyId: number;

    @ApiPropertyOptional({
        description: 'Код причины отказа (список уточняется с клиентом).',
        example: 'no_budget',
        type: String,
    })
    @IsOptional()
    @IsString()
    reasonCode?: string;
}

/** Тело кнопки фрейма «в буфер отказников». */
export class RejectBufferRunDto extends SalesHookRunRequestBaseDto {
    @ApiPropertyOptional({
        description:
            'Компания, чьи сделки отправляются в буфер. Обязательна, если ' +
            'не переданы dealIds.',
        example: 7,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    companyId?: number;

    @ApiPropertyOptional({
        description:
            'Явный набор сделок. Обязателен, если не передана companyId. ' +
            'Чужие воронки игнорируются.',
        example: [1024],
        type: [Number],
    })
    @IsOptional()
    @IsArray()
    @ArrayMinSize(1)
    @IsInt({ each: true })
    @Min(1, { each: true })
    dealIds?: number[];

    @ApiPropertyOptional({
        description: 'Код причины отказа (список уточняется с клиентом).',
        example: 'no_budget',
        type: String,
    })
    @IsOptional()
    @IsString()
    reasonCode?: string;

    @ApiPropertyOptional({
        description:
            'Открытые задачи: complete — завершить с причиной в описании, ' +
            'keep — не трогать.',
        example: 'complete',
        type: String,
        enum: REJECT_BUFFER_TASK_MODES,
        default: 'complete',
    })
    @IsOptional()
    @IsString()
    @IsIn(REJECT_BUFFER_TASK_MODES as unknown as string[])
    taskMode?: RejectBufferTaskMode;
}

/** Элемент пачки — внутренний контракт. */
export interface IRejectBufferItem {
    companyId?: number;
    dealIds?: number[];
    reasonCode?: string;
    taskMode: RejectBufferTaskMode;
}
