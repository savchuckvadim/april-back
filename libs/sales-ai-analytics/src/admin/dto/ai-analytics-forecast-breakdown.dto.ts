/**
 * Ответ админ-ручки `GET admin/ai-analytics/forecast-breakdown` (Фаза 4,
 * п. 4.1): разложение прогноза отдела на слагаемые по отделу и менеджерам.
 */
import { ApiProperty } from '@nestjs/swagger';
import {
    AI_FORECAST_METHODS,
    type AiForecastMethod,
} from '../../model/presentation-flow.types';
import type {
    ForecastBreakdownManagerView,
    ForecastBreakdownView,
} from '../services/ai-analytics-forecast-breakdown.types';
import { AiForecastBreakdownDepartmentDto } from './ai-analytics-forecast-breakdown.department.dto';
import {
    AiForecastBreakdownEpisodeDto,
    AiForecastBreakdownManagerFlowDto,
    BREAKDOWN_METHOD_DESCRIPTION as METHOD_DESCRIPTION,
    BREAKDOWN_NEW_FLOW_DESCRIPTION as NEW_FLOW_DESCRIPTION,
    BREAKDOWN_PIPELINE_DESCRIPTION as PIPELINE_DESCRIPTION,
} from './ai-analytics-forecast-breakdown.parts.dto';

export { AiForecastBreakdownDepartmentDto } from './ai-analytics-forecast-breakdown.department.dto';
export {
    AiForecastBreakdownEpisodeDto,
    AiForecastBreakdownFlowDto,
    AiForecastBreakdownManagerFlowDto,
} from './ai-analytics-forecast-breakdown.parts.dto';

export class AiForecastBreakdownManagerDto
    implements ForecastBreakdownManagerView
{
    @ApiProperty({
        description: METHOD_DESCRIPTION,
        enum: AI_FORECAST_METHODS,
        example: 'presentations-v2',
    })
    method: AiForecastMethod;

    @ApiProperty({
        description: 'Id сотрудника в Битрикс24.',
        example: '15',
        type: String,
    })
    managerId: string;

    @ApiProperty({
        description: 'Середина прогноза продаж менеджера за месяц.',
        example: 5.4,
        type: Number,
    })
    p50: number;

    @ApiProperty({
        description: 'Закрытых продаж менеджера с начала месяца.',
        example: 2,
        type: Number,
    })
    done: number;

    @ApiProperty({
        description: PIPELINE_DESCRIPTION,
        example: 1.1,
        type: Number,
        nullable: true,
    })
    pipeline: number | null;

    @ApiProperty({
        description: NEW_FLOW_DESCRIPTION,
        example: 2.3,
        type: Number,
        nullable: true,
    })
    newFlow: number | null;

    @ApiProperty({
        description: 'Простой расчёт по темпу менеджера — для сравнения.',
        example: 4,
        type: Number,
    })
    naive: number;

    @ApiProperty({
        description: 'Цель менеджера на месяц; null — не задана.',
        example: 6,
        type: Number,
        nullable: true,
    })
    target: number | null;

    @ApiProperty({
        description:
            'Сделано входной активности с начала месяца (presentations-v2 — ' +
            'презентаций, calls-v1 — звонков); null — запись до 16.11.2026.',
        example: 38,
        type: Number,
        nullable: true,
    })
    entryDone: number | null;

    @ApiProperty({
        description: 'Темп входной активности в рабочий день.',
        example: 3.5,
        type: Number,
        nullable: true,
    })
    entryRate: number | null;

    @ApiProperty({
        description:
            'Продаж на единицу входной активности (0–1): presentations-v2 — ' +
            'на презентацию; calls-v1 — на звонок по нормам рёбер.',
        example: 0.06,
        type: Number,
        nullable: true,
    })
    conversion: number | null;

    @ApiProperty({
        description:
            'Какая доля будущих продаж успеет закрыться до конца месяца ' +
            '(0–1).',
        example: 0.55,
        type: Number,
        nullable: true,
    })
    fBar: number | null;

    @ApiProperty({
        description:
            'Открытых сделок менеджера (presentations-v2 — справочно).',
        example: 27,
        type: Number,
        nullable: true,
    })
    openEpisodes: number | null;

    @ApiProperty({
        description:
            'До пяти открытых сделок с наибольшим вкладом в ожидание, ' +
            'крупные первыми; пусто — истории стадий нет или запись старая.',
        type: [AiForecastBreakdownEpisodeDto],
    })
    topEpisodes: AiForecastBreakdownEpisodeDto[];

    @ApiProperty({
        description:
            'Ожидание от открытых сделок — справочно, в середину не входит ' +
            '(presentations-v2); null — старый расчёт или истории стадий нет.',
        example: 0.4,
        type: Number,
        nullable: true,
    })
    deals: number | null;

    @ApiProperty({
        description: 'Входы прогноза от презентаций; null — старый расчёт.',
        type: AiForecastBreakdownManagerFlowDto,
        nullable: true,
    })
    flow: AiForecastBreakdownManagerFlowDto | null;
}

export class AiForecastBreakdownResultDto implements ForecastBreakdownView {
    @ApiProperty({
        description: 'Домен портала.',
        example: 'april.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description:
            'День, за который показано разложение; null — прогноз ещё не ' +
            'считался.',
        example: '2026-11-16',
        type: String,
        nullable: true,
    })
    day: string | null;

    @ApiProperty({
        description: 'Разложение по отделу; null — журнала прогноза нет.',
        type: AiForecastBreakdownDepartmentDto,
        nullable: true,
    })
    department: AiForecastBreakdownDepartmentDto | null;

    @ApiProperty({
        description:
            'Разложение по менеджерам за тот же день, крупные прогнозы ' +
            'первыми.',
        type: [AiForecastBreakdownManagerDto],
    })
    managers: AiForecastBreakdownManagerDto[];
}
