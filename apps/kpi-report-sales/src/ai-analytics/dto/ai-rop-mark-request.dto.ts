import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import { CALL_REPORT_SECTION_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import {
    AI_ROP_MARK_LIMITS,
    AI_ROP_MARK_WEEK_KEY_PATTERN,
} from '../constants/ai-rop-mark.const';
import { AiRequestBaseDto } from './ai-request-base.dto';

/**
 * Запросы слепой проверки «три звонка недели» (план Фазы 2, поток 15).
 * Ответы — в `ai-rop-mark.dto.ts`: файл разделён, чтобы каждый остался
 * в пределах 300 строк.
 */

/** Общая часть запросов проверки: неделя задаётся ключом либо датой. */
export class AiRopMarkWeekRequestDto extends AiRequestBaseDto {
    @ApiPropertyOptional({
        description:
            'Ключ ISO-недели проверки в формате YYYY-Www. Не передан — ' +
            'берётся неделя даты date, а без неё — текущая неделя портала.',
        type: String,
        example: '2026-W36',
    })
    @IsOptional()
    @IsString()
    @Matches(AI_ROP_MARK_WEEK_KEY_PATTERN, {
        message: 'weekKey должен быть в формате YYYY-Www',
    })
    weekKey?: string;

    @ApiPropertyOptional({
        description:
            'Любой день нужной недели в TZ портала (YYYY-MM-DD). ' +
            'Используется, когда ключ недели не передан.',
        type: String,
        example: '2026-09-03',
    })
    @IsOptional()
    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date должна быть YYYY-MM-DD' })
    date?: string;
}

/**
 * Подбор трёх звонков недели для слепой проверки (план §12: три звонка —
 * весь человеческий бюджет недели). Повторный запрос отдаёт тот же набор:
 * подбор детерминирован по домену и ключу недели.
 */
export class AiRopMarkPickRequestDto extends AiRopMarkWeekRequestDto {
    @ApiPropertyOptional({
        description:
            'Подобрать заново, даже если подбор недели уже сохранён. ' +
            'Набор от этого не меняется — меняются только звонки, ' +
            'попавшие в неделю после прошлого подбора.',
        type: Boolean,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    forceRefresh?: boolean;
}

/** Список подбора и уже поставленных меток за неделю. */
export class AiRopMarkListRequestDto extends AiRopMarkWeekRequestDto {}

/** Сохранение слепой метки руководителя по одному звонку недели. */
export class AiRopMarkSaveRequestDto extends AiRopMarkWeekRequestDto {
    @ApiProperty({
        description:
            'Id транскрипции звонка из подбора недели. Звонок вне подбора ' +
            'метку не принимает (400).',
        type: String,
        example: '1024',
    })
    @IsString()
    @MaxLength(64)
    transcriptionId: string;

    @ApiProperty({
        description: 'Согласен ли руководитель с оценкой AI по этому звонку.',
        type: Boolean,
        example: false,
    })
    @IsBoolean()
    agree: boolean;

    @ApiPropertyOptional({
        description:
            'Своя оценка руководителя в шкале 1–10 (та же шкала, что у ' +
            'разбора). Не передана — руководитель оценку не ставил.',
        type: Number,
        example: 6,
    })
    @IsOptional()
    @IsInt()
    @Min(AI_ROP_MARK_LIMITS.scoreMin)
    @Max(AI_ROP_MARK_LIMITS.scoreMax)
    ropScore?: number;

    @ApiPropertyOptional({
        description:
            'Коды разделов рубрики, к которым относится замечание ' +
            '(GREETING, NEEDS, PRESENTATION, OBJECTIONS, PRICE, CLOSING, ' +
            'REFUSAL).',
        isArray: true,
        enum: CALL_REPORT_SECTION_CODES,
        example: ['NEEDS', 'CLOSING'],
    })
    @IsOptional()
    @IsArray()
    @IsIn(CALL_REPORT_SECTION_CODES, { each: true })
    sections?: string[];

    @ApiPropertyOptional({
        description: 'Почему так: что руководитель услышал в звонке.',
        type: String,
        example: 'Потребность не выявлена, менеджер сразу ушёл в цену',
    })
    @IsOptional()
    @IsString()
    @MaxLength(AI_ROP_MARK_LIMITS.text)
    why?: string;

    @ApiPropertyOptional({
        description: 'Как лучше: что сделать в следующий раз.',
        type: String,
        example: 'Сначала два вопроса про процесс, потом предложение',
    })
    @IsOptional()
    @IsString()
    @MaxLength(AI_ROP_MARK_LIMITS.text)
    howTo?: string;
}
