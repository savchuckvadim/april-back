import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import {
    RECOMMENDATION_GATE_REASONS,
    RECOMMENDATION_GATE_STATUSES,
    type RecommendationGateReason,
    type RecommendationGateStatus,
} from '@lib/sales-ai-analytics';
import { AiAboutIntervalDto, AiAboutShareDto } from './ai-about-phase4.dto';

/**
 * Секция Фазы 4 блока «Как считаем»: эффект советов — выполнение, доля
 * несогласий и шаги воронки до/после (вынесено из `ai-about-phase4.dto.ts`
 * по лимиту 300 строк).
 */

/** Шаг воронки до и после советов. */
export class AiAboutEdgeEffectDto {
    @ApiProperty({
        description: 'Код шага воронки.',
        type: String,
        example: 'presentation_to_offer',
    })
    @IsString()
    edge: string;

    @ApiProperty({
        description:
            'Доля перехода до совета; null — переходов меньше минимума выборки (n_min_none).',
        type: Number,
        nullable: true,
        example: 0.3,
    })
    @IsOptional()
    @IsNumber()
    before: number | null;

    @ApiProperty({
        description:
            'Доля перехода после совета; null — переходов меньше минимума выборки (n_min_none).',
        type: Number,
        nullable: true,
        example: 0.36,
    })
    @IsOptional()
    @IsNumber()
    after: number | null;

    @ApiProperty({
        description:
            'Разница «после − до» с 90 %-интервалом; null — «до» или «после» ' +
            'переходов меньше минимума выборки (n_min_none).',
        type: AiAboutIntervalDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AiAboutIntervalDto)
    diff: AiAboutIntervalDto | null;

    @ApiProperty({
        description:
            'Окон «менеджер × месяц совета» в сравнении (не число советов).',
        type: Number,
        example: 12,
    })
    @IsNumber()
    windows: number;
}

/** Эффект советов: выполнение и шаги воронки до/после. */
export class AiAboutRecommendationsEffectDto {
    @ApiProperty({
        description: 'Месяц расчёта YYYY-MM.',
        type: String,
        example: '2026-08',
    })
    @IsString()
    monthKey: string;

    @ApiProperty({
        description:
            'Итог проверки советов: pass — пройдена, fail — нет, ' +
            'insufficient — советов пока мало.',
        enum: RECOMMENDATION_GATE_STATUSES,
        example: 'insufficient',
    })
    @IsIn(RECOMMENDATION_GATE_STATUSES)
    status: RecommendationGateStatus;

    @ApiProperty({
        description: 'Коды причин непройденной проверки.',
        enum: RECOMMENDATION_GATE_REASONS,
        isArray: true,
        example: ['issued-below-min'],
    })
    @IsArray()
    @IsIn(RECOMMENDATION_GATE_REASONS, { each: true })
    reasons: RecommendationGateReason[];

    @ApiProperty({ description: 'Выдано советов.', type: Number, example: 24 })
    @IsNumber()
    issued: number;

    @ApiProperty({
        description: 'Советов с закрытым окном «после».',
        type: Number,
        example: 18,
    })
    @IsNumber()
    completedWindows: number;

    @ApiProperty({
        description: 'Отмечено выполненными.',
        type: Number,
        example: 14,
    })
    @IsNumber()
    done: number;

    @ApiProperty({
        description: 'Несогласий с советами.',
        type: Number,
        example: 2,
    })
    @IsNumber()
    disagree: number;

    @ApiProperty({
        description: 'Доля выполненных советов с интервалом.',
        type: AiAboutShareDto,
    })
    @ValidateNested()
    @Type(() => AiAboutShareDto)
    doneShare: AiAboutShareDto;

    @ApiProperty({
        description: 'Доля несогласий с интервалом.',
        type: AiAboutShareDto,
    })
    @ValidateNested()
    @Type(() => AiAboutShareDto)
    disagreeShare: AiAboutShareDto;

    @ApiProperty({
        description: 'Шаги воронки до и после советов.',
        type: [AiAboutEdgeEffectDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AiAboutEdgeEffectDto)
    beforeAfter: AiAboutEdgeEffectDto[];

    @ApiProperty({
        description:
            'Сигналов подгонки под показатель у менеджеров (0 — чисто).',
        type: Number,
        example: 0,
    })
    @IsNumber()
    goodhartFlags: number;

    @ApiProperty({
        description:
            'Менеджеров хотя бы с одним сигналом подгонки (0 — чисто).',
        type: Number,
        example: 0,
    })
    @IsNumber()
    goodhartManagers: number;
}
