/**
 * Отдел в ответе «Разложение прогноза» (`GET admin/ai-analytics/forecast-
 * breakdown`). Вынесено из `ai-analytics-forecast-breakdown.dto.ts` по
 * лимиту 300 строк.
 */
import { ApiProperty } from '@nestjs/swagger';
import {
    AI_FORECAST_METHODS,
    type AiForecastMethod,
} from '../../model/presentation-flow.types';
import type { ForecastBreakdownDepartmentView } from '../services/ai-analytics-forecast-breakdown.types';
import {
    AiForecastBreakdownFlowDto,
    BREAKDOWN_METHOD_DESCRIPTION as METHOD_DESCRIPTION,
    BREAKDOWN_NEW_FLOW_DESCRIPTION as NEW_FLOW_DESCRIPTION,
    BREAKDOWN_PIPELINE_DESCRIPTION as PIPELINE_DESCRIPTION,
} from './ai-analytics-forecast-breakdown.parts.dto';

export class AiForecastBreakdownDepartmentDto
    implements ForecastBreakdownDepartmentView
{
    @ApiProperty({
        description: METHOD_DESCRIPTION,
        enum: AI_FORECAST_METHODS,
        example: 'presentations-v2',
    })
    method: AiForecastMethod;

    @ApiProperty({
        description: 'День журнала, за который показано разложение.',
        example: '2026-11-16',
        type: String,
    })
    day: string;

    @ApiProperty({
        description: 'Месяц прогноза (YYYY-MM).',
        example: '2026-11',
        type: String,
    })
    monthKey: string;

    @ApiProperty({
        description: 'Середина прогноза продаж отдела за месяц.',
        example: 46,
        type: Number,
    })
    p50: number;

    @ApiProperty({
        description: 'Нижняя граница вилки.',
        example: 38,
        type: Number,
    })
    low: number;

    @ApiProperty({
        description: 'Верхняя граница вилки.',
        example: 55,
        type: Number,
    })
    high: number;

    @ApiProperty({
        description: 'Закрытых продаж с начала месяца.',
        example: 21,
        type: Number,
    })
    done: number;

    @ApiProperty({
        description: PIPELINE_DESCRIPTION,
        example: 9.5,
        type: Number,
        nullable: true,
    })
    pipeline: number | null;

    @ApiProperty({
        description: NEW_FLOW_DESCRIPTION,
        example: 15.5,
        type: Number,
        nullable: true,
    })
    newFlow: number | null;

    @ApiProperty({
        description: 'Простой расчёт по темпу с начала месяца — для сравнения.',
        example: 44,
        type: Number,
    })
    naive: number;

    @ApiProperty({
        description:
            'Среднее продаж трёх прошлых месяцев — для сравнения; null — ' +
            'истории нет.',
        example: 41.3,
        type: Number,
        nullable: true,
    })
    mean3: number | null;

    @ApiProperty({
        description: 'Менеджеров в расчёте.',
        example: 12,
        type: Number,
    })
    managers: number;

    @ApiProperty({
        description:
            'У скольких из них нет истории стадий: ожидание от открытых ' +
            'сделок у них не считалось.',
        example: 0,
        type: Number,
    })
    pipelineUnknown: number;

    @ApiProperty({
        description: 'Подбор прогноза от презентаций; null — старый расчёт.',
        type: AiForecastBreakdownFlowDto,
        nullable: true,
    })
    flow: AiForecastBreakdownFlowDto | null;
}
