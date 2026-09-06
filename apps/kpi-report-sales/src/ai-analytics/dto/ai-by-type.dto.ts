import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import {
    AI_ANALYTICS_BY_TYPE_CODES,
    AI_ANALYTICS_BY_TYPE_INDICATOR_KINDS,
    AI_ANALYTICS_BY_TYPE_LAYOUTS,
    AI_ANALYTICS_MANAGER_LEVELS,
    AiAnalyticsByTypeCode,
    AiAnalyticsByTypeIndicatorKind,
    AiAnalyticsByTypeLayout,
    AiAnalyticsManagerLevel,
} from '../constants/ai-overview.const';
import { AiCellKpiDto, AiManagerTypeCellDto } from './ai-manager-type-cell.dto';
import { AiFinanceTailDto } from './ai-manager-row.dto';
import { AiObjectionsDto } from './ai-objections.dto';
import { AiOverviewFiltersDto } from './ai-overview-request.dto';
import { AiOverviewPeriodDto, AiTypeTotalsDto } from './ai-overview.dto';
import { AiAnalyticsEnvelopeDto } from './ai-response-envelope.dto';
import { MetricDto } from './metric.dto';

/** Срез обзора по типу звонка или возражениям (ТЗ FR-21). */
export class AiByTypeRequestDto extends AiOverviewFiltersDto {
    @ApiProperty({
        description:
            'AI-тип звонка (подвкладка) либо objections — сквозной срез возражений.',
        enum: AI_ANALYTICS_BY_TYPE_CODES,
        example: 'presentation',
    })
    @IsIn(AI_ANALYTICS_BY_TYPE_CODES)
    callType: AiAnalyticsByTypeCode;

    @ApiPropertyOptional({
        description:
            'Раскладка: wide — строка на менеджера (n, оценка, KPI, финансы, ' +
            'объяснение); long — строка на «сотрудник | показатель | оценка | ' +
            'объяснение» по разделам, чек-листам и KPI.',
        enum: AI_ANALYTICS_BY_TYPE_LAYOUTS,
        default: 'wide',
        example: 'long',
    })
    @IsOptional()
    @IsIn(AI_ANALYTICS_BY_TYPE_LAYOUTS)
    layout?: AiAnalyticsByTypeLayout;
}

/** «Широкая» строка: менеджер × выбранный тип. */
export class AiByTypeWideRowDto {
    @ApiProperty({ description: 'Bitrix-id менеджера.', type: String })
    managerId: string;

    @ApiProperty({
        description: 'Уровень менеджера.',
        enum: AI_ANALYTICS_MANAGER_LEVELS,
        example: 'middle',
    })
    level: AiAnalyticsManagerLevel;

    @ApiProperty({
        description: 'Id отдела продаж; null — вне ростера.',
        type: Number,
        nullable: true,
        example: 37,
    })
    departmentId: number | null;

    @ApiProperty({ description: 'Ячейка типа.', type: AiManagerTypeCellDto })
    cell: AiManagerTypeCellDto;

    @ApiProperty({
        description: 'Главный KPI-факт типа; null — типу нечего считать.',
        type: AiCellKpiDto,
        nullable: true,
    })
    primaryKpi: AiCellKpiDto | null;

    @ApiProperty({ description: 'Финансовый хвост.', type: AiFinanceTailDto })
    finance: AiFinanceTailDto;
}

/** «Длинная» строка: сотрудник | показатель | оценка | объяснение. */
export class AiByTypeLongRowDto {
    @ApiProperty({
        description: 'Bitrix-id менеджера (сотрудник).',
        type: String,
    })
    managerId: string;

    @ApiProperty({
        description:
            'Вид показателя: score — оценка типа, section — раздел рубрики, ' +
            'checklist — чек-лист, kpi — факт самоотчёта, objection — категория.',
        enum: AI_ANALYTICS_BY_TYPE_INDICATOR_KINDS,
        example: 'section',
    })
    kind: AiAnalyticsByTypeIndicatorKind;

    @ApiProperty({
        description: 'Код показателя (раздел, чек-лист, KPI-код, категория).',
        type: String,
        example: 'PRICE',
    })
    indicator: string;

    @ApiProperty({
        description: 'Подпись показателя.',
        type: String,
        example: 'Работа по цене',
    })
    title: string;

    @ApiProperty({
        description:
            'Оценка: средняя 1–10 (score/section), доля в % (checklist/objection) ' +
            'или факт (kpi, n = 0); value = null при мало данных.',
        type: MetricDto,
    })
    metric: MetricDto;

    @ApiProperty({
        description: 'Объяснение показателя (шаблон кода).',
        type: String,
        example: 'Раздел «работа по цене»: 4,2/10 (n = 11, применимость 72 %).',
    })
    explanation: string;
}

/** Срез по типу. */
export class AiByTypeDto {
    @ApiProperty({
        description: 'Выбранный тип или objections.',
        enum: AI_ANALYTICS_BY_TYPE_CODES,
        example: 'presentation',
    })
    callType: AiAnalyticsByTypeCode;

    @ApiProperty({
        description: 'Подпись типа.',
        type: String,
        example: 'Презентация',
    })
    title: string;

    @ApiProperty({
        description: 'Раскладка ответа.',
        enum: AI_ANALYTICS_BY_TYPE_LAYOUTS,
        example: 'wide',
    })
    layout: AiAnalyticsByTypeLayout;

    @ApiProperty({ description: 'Период обзора.', type: AiOverviewPeriodDto })
    period: AiOverviewPeriodDto;

    @ApiProperty({
        description:
            'Строки «широкой» раскладки; null при layout = long или objections.',
        type: [AiByTypeWideRowDto],
        nullable: true,
    })
    wide: AiByTypeWideRowDto[] | null;

    @ApiProperty({
        description: 'Строки «длинной» раскладки; null при layout = wide.',
        type: [AiByTypeLongRowDto],
        nullable: true,
    })
    long: AiByTypeLongRowDto[] | null;

    @ApiProperty({
        description: 'Итог по типу по домену; null для objections.',
        type: AiTypeTotalsDto,
        nullable: true,
    })
    totals: AiTypeTotalsDto | null;

    @ApiProperty({
        description: 'Срез возражений (только для callType = objections).',
        type: AiObjectionsDto,
        nullable: true,
    })
    objections: AiObjectionsDto | null;
}

export class AiByTypeResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiPropertyOptional({
        description: 'Срез (при status = ready); иначе обзор ещё считается.',
        type: AiByTypeDto,
    })
    data?: AiByTypeDto;
}
