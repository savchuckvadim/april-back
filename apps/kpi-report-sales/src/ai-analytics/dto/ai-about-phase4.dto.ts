import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import {
    AI_QUALITY_LINK_STATUSES,
    type AiQualityLinkStatus,
} from '@lib/sales-ai-analytics';

/**
 * Секции Фазы 4 блока «Как считаем» (план §4.4, §4.8, §4.10, §4.11, §10):
 * общие формы «оценка с интервалом» и «доля с интервалом» и связь качества
 * с результатом. Точность прогноза и пул — `ai-about-phase4-pool.dto.ts`,
 * эффект советов — `ai-about-phase4-effect.dto.ts`. Все числа — с
 * интервалами; секция null, пока данных нет. Коды статусов и причин —
 * словари библиотеки, подписи по-русски строит фронт.
 */

/** Оценка с 90 %-интервалом. */
export class AiAboutIntervalDto {
    @ApiProperty({
        description: 'Оценка.',
        type: Number,
        example: 0.21,
    })
    @IsNumber()
    value: number;

    @ApiProperty({
        description: 'Нижняя граница 90 %-интервала; null — не определена.',
        type: Number,
        nullable: true,
        example: 0.08,
    })
    @IsOptional()
    @IsNumber()
    low: number | null;

    @ApiProperty({
        description: 'Верхняя граница 90 %-интервала; null — не определена.',
        type: Number,
        nullable: true,
        example: 0.34,
    })
    @IsOptional()
    @IsNumber()
    high: number | null;
}

/** Доля с 90 %-интервалом Уилсона и знаменателем. */
export class AiAboutShareDto {
    @ApiProperty({
        description: 'Доля 0..1; null — наблюдений меньше минимума.',
        type: Number,
        nullable: true,
        example: 0.62,
    })
    @IsOptional()
    @IsNumber()
    value: number | null;

    @ApiProperty({
        description: 'Нижняя граница 90 %-интервала; null — доля скрыта.',
        type: Number,
        nullable: true,
        example: 0.48,
    })
    @IsOptional()
    @IsNumber()
    low: number | null;

    @ApiProperty({
        description: 'Верхняя граница 90 %-интервала; null — доля скрыта.',
        type: Number,
        nullable: true,
        example: 0.74,
    })
    @IsOptional()
    @IsNumber()
    high: number | null;

    @ApiProperty({
        description: 'Знаменатель доли (дней, советов).',
        type: Number,
        example: 40,
    })
    @IsNumber()
    n: number;
}

/** Связь «качество разговора → КП или счёт в ближайшие дни». */
export class AiAboutQualityLinkDto {
    @ApiProperty({
        description: 'Месяц оценки YYYY-MM.',
        type: String,
        example: '2026-09',
    })
    @IsString()
    monthKey: string;

    @ApiProperty({
        description:
            'Статус: insufficient — данных мало, estimated — оценка есть, ' +
            'но проверка ещё не пройдена нужное число месяцев подряд, ' +
            'published — связь учитывается в плане дня.',
        enum: AI_QUALITY_LINK_STATUSES,
        example: 'estimated',
    })
    @IsIn(AI_QUALITY_LINK_STATUSES)
    status: AiQualityLinkStatus;

    @ApiProperty({
        description: 'Связь учитывается в расчётах (проверка пройдена).',
        type: Boolean,
        example: false,
    })
    @IsBoolean()
    published: boolean;

    @ApiProperty({
        description:
            'Связь внутри менеджера: насколько меняются шансы, когда тот же ' +
            'менеджер говорит лучше (на балл качества); null — не оценена ' +
            'или проверка ещё не пройдена (до неё связь не показывается).',
        type: AiAboutIntervalDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AiAboutIntervalDto)
    within: AiAboutIntervalDto | null;

    @ApiProperty({
        description:
            'Связь между менеджерами: у кого качество в среднем выше; ' +
            'null — не оценена или проверка ещё не пройдена.',
        type: AiAboutIntervalDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AiAboutIntervalDto)
    between: AiAboutIntervalDto | null;

    @ApiProperty({
        description:
            'Общая оценка связи; null — не оценена или проверка ещё ' +
            'не пройдена (до неё связь не показывается).',
        type: AiAboutIntervalDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AiAboutIntervalDto)
    pooled: AiAboutIntervalDto | null;

    @ApiProperty({
        description:
            'Надёжность оценки разговора (повторяемость балла); null — не ' +
            'измерена, поправка на неё не делалась.',
        type: Number,
        nullable: true,
        example: 0.7,
    })
    @IsOptional()
    @IsNumber()
    reliability: number | null;

    @ApiProperty({
        description:
            'Согласие прогноза шансов с фактом (наклон, 1 — идеально); ' +
            'null — не считалось.',
        type: AiAboutIntervalDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AiAboutIntervalDto)
    calibrationSlope: AiAboutIntervalDto | null;

    @ApiProperty({
        description:
            'Проверка «связь не объясняется будущим»: true — пройдена; ' +
            'null — не считалась.',
        type: Boolean,
        nullable: true,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    placeboPassed: boolean | null;

    @ApiProperty({
        description: 'Сколько месяцев подряд проверка пройдена.',
        type: Number,
        example: 1,
    })
    @IsNumber()
    gatePassedMonths: number;

    @ApiProperty({
        description: 'Сколько месяцев подряд нужно для учёта связи.',
        type: Number,
        example: 2,
    })
    @IsNumber()
    gateMonths: number;

    @ApiProperty({
        description: 'Презентаций в оценке.',
        type: Number,
        example: 420,
    })
    @IsNumber()
    n: number;

    @ApiProperty({
        description: 'Из них с КП или счётом в ближайшие дни.',
        type: Number,
        example: 150,
    })
    @IsNumber()
    events: number;

    @ApiProperty({
        description: 'Менеджеров в оценке.',
        type: Number,
        example: 9,
    })
    @IsNumber()
    managers: number;
}
