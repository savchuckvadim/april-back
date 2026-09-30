import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import {
    AI_FORECAST_BACKTEST_REASONS,
    AI_FORECAST_BACKTEST_STATUSES,
    AI_POOL_BETA_LABELS,
    AI_POOL_PORTAL_REASONS,
    AI_POOL_STATUSES,
    type ForecastBacktestReason,
    type ForecastBacktestStatus,
    type PoolBetaLabel,
    type PoolPortalReason,
    type PoolStatus,
} from '@lib/sales-ai-analytics';
import { AiAboutIntervalDto, AiAboutShareDto } from './ai-about-phase4.dto';

/**
 * Секции Фазы 4 блока «Как считаем»: точность прогноза отдела и пул
 * порталов (вынесено из `ai-about-phase4.dto.ts` по лимиту 300 строк).
 */

/** Вердикты портала в пуле — runtime-массив для Swagger и валидации. */
export const AI_ABOUT_POOL_SELF_REASONS = Object.values(
    AI_POOL_PORTAL_REASONS,
) as readonly PoolPortalReason[];

/** Точность прогноза отдела на прошлых месяцах. */
export class AiAboutForecastAccuracyDto {
    @ApiProperty({
        description: 'Месяц последней проверки YYYY-MM.',
        type: String,
        example: '2026-08',
    })
    @IsString()
    monthKey: string;

    @ApiProperty({
        description:
            'Итог проверки: pass — пройдена, fail — не пройдена, ' +
            'insufficient — месяцев пока мало.',
        enum: AI_FORECAST_BACKTEST_STATUSES,
        example: 'insufficient',
    })
    @IsIn(AI_FORECAST_BACKTEST_STATUSES)
    status: ForecastBacktestStatus;

    @ApiProperty({
        description: 'Коды причин непройденной проверки.',
        enum: AI_FORECAST_BACKTEST_REASONS,
        isArray: true,
        example: ['not-enough-months'],
    })
    @IsArray()
    @IsIn(AI_FORECAST_BACKTEST_REASONS, { each: true })
    reasons: ForecastBacktestReason[];

    @ApiProperty({
        description: 'Закрытых месяцев, когда прогноз считался без показа.',
        type: Number,
        example: 4,
    })
    @IsNumber()
    shadowMonths: number;

    @ApiProperty({
        description: 'Сколько таких месяцев нужно перед показом.',
        type: Number,
        example: 9,
    })
    @IsNumber()
    shadowMinMonths: number;

    @ApiProperty({
        description:
            'Как часто факт месяца попадал в вилку (доля дней с интервалом); ' +
            'null — проверки ещё не было.',
        type: AiAboutShareDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AiAboutShareDto)
    coverage: AiAboutShareDto | null;

    @ApiProperty({
        description: 'Целевая доля попаданий в вилку; null — не задана.',
        type: Number,
        nullable: true,
        example: 0.8,
    })
    @IsOptional()
    @IsNumber()
    coverageTarget: number | null;

    @ApiProperty({
        description:
            'Во сколько раз ошибка прогноза меньше ошибки правила «по темпу ' +
            'с начала месяца» (сделанное, растянутое на весь месяц; меньше ' +
            '1 — прогноз лучше); null — не считалось. Имя поля историческое.',
        type: AiAboutIntervalDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AiAboutIntervalDto)
    errorVsLastMonth: AiAboutIntervalDto | null;

    @ApiProperty({
        description:
            'То же против среднего за три месяца; null — не считалось.',
        type: AiAboutIntervalDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AiAboutIntervalDto)
    errorVsMean3: AiAboutIntervalDto | null;

    @ApiProperty({
        description: 'Порог отношения ошибок для приёмки; null — не задан.',
        type: Number,
        nullable: true,
        example: 1,
    })
    @IsOptional()
    @IsNumber()
    errorRatioMax: number | null;
}

/** Обезличенный пул порталов. */
export class AiAboutPoolDto {
    @ApiProperty({
        description: 'Месяц сборки пула YYYY-MM.',
        type: String,
        example: '2026-08',
    })
    @IsString()
    monthKey: string;

    @ApiProperty({
        description:
            'Статус: estimated — общие оценки есть, insufficient — порталов ' +
            'с согласием пока мало.',
        enum: AI_POOL_STATUSES,
        example: 'insufficient',
    })
    @IsIn(AI_POOL_STATUSES)
    status: PoolStatus;

    @ApiProperty({
        description: 'Порталов-участников с согласием и достаточной историей.',
        type: Number,
        example: 2,
    })
    @IsNumber()
    participants: number;

    @ApiProperty({
        description: 'Сколько участников нужно для общих оценок.',
        type: Number,
        example: 3,
    })
    @IsNumber()
    minParticipants: number;

    @ApiProperty({
        description: 'Сколько месяцев истории нужно порталу для участия.',
        type: Number,
        example: 6,
    })
    @IsNumber()
    minHistoryMonths: number;

    @ApiProperty({
        description:
            'Участвует ли этот портал: included — да, no-consent — нет ' +
            'согласия, consent-not-yet — согласие позже месяца пула, ' +
            'short-history — мало истории; null — не найден в пуле.',
        enum: AI_ABOUT_POOL_SELF_REASONS,
        nullable: true,
        example: 'included',
    })
    @IsOptional()
    @IsIn(AI_ABOUT_POOL_SELF_REASONS)
    selfReason: PoolPortalReason | null;

    @ApiProperty({
        description:
            'Общая по порталам связь качества с результатом; null — не ' +
            'оценена.',
        type: AiAboutIntervalDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AiAboutIntervalDto)
    qualityLink: AiAboutIntervalDto | null;

    @ApiProperty({
        description:
            'Насколько порталы различаются по связи (0..1, чем больше, тем ' +
            'сильнее); null — не оценено.',
        type: Number,
        nullable: true,
        example: 0.35,
    })
    @IsOptional()
    @IsNumber()
    heterogeneity: number | null;

    @ApiProperty({
        description:
            'Метка общей связи: estimated — по данным порталов, hybrid — ' +
            'порталов мало, разброс взят по умолчанию; null — связи нет.',
        enum: AI_POOL_BETA_LABELS,
        nullable: true,
        example: 'hybrid',
    })
    @IsOptional()
    @IsIn(AI_POOL_BETA_LABELS)
    label: PoolBetaLabel | null;

    @ApiProperty({
        description:
            'Шагов воронки, где сила подтягивания к норме уточнена общими ' +
            'данными порталов (по последнему расчёту модели).',
        type: Number,
        example: 2,
    })
    @IsNumber()
    edgesFromPool: number;

    @ApiProperty({
        description: 'Срок оплаты уточнён общей таблицей порталов.',
        type: Boolean,
        example: false,
    })
    @IsBoolean()
    lagFromPool: boolean;

    @ApiProperty({
        description: 'Сезонность взята по общим данным порталов.',
        type: Boolean,
        example: false,
    })
    @IsBoolean()
    seasonFromPool: boolean;
}
