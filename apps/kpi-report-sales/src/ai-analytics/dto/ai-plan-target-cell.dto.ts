/**
 * Ячейка «план руководителя против факта» строки менеджера обзора —
 * РОВНО как ячейка блока «Планы» на вкладке KPI (PlanAchievementCell
 * фронта): те же включённые показатели, тот же пересчёт плана на период,
 * тот же факт.
 */
import { ApiProperty } from '@nestjs/swagger';
import {
    PLAN_FACT_SOURCES,
    PLAN_INDICATOR_CODE_LIST,
    PLAN_PERIOD_TYPES,
    PLAN_UNITS,
    type PlanFactSource,
    type PlanIndicatorCode,
    type PlanPeriodType,
    type PlanUnit,
} from '../../plans';
import type { AiPlanTargetCell } from '../domain/assembler/plan-targets.assembler';

export class AiPlanTargetCellDto implements AiPlanTargetCell {
    @ApiProperty({
        description:
            'Код показателя плана (каталог планов, поле «План: …» сотрудника).',
        enum: PLAN_INDICATOR_CODE_LIST,
        example: 'presentations_done',
    })
    code: PlanIndicatorCode;

    @ApiProperty({
        description:
            'Название показателя как в блоке «Планы»: своё название портала ' +
            'либо название по умолчанию.',
        type: String,
        example: 'Презентации',
    })
    name: string;

    @ApiProperty({
        description:
            'Единица измерения для форматирования: count — штуки, money — ' +
            'рубли, minutes — минуты.',
        enum: PLAN_UNITS,
        example: 'count',
    })
    unit: PlanUnit;

    @ApiProperty({
        description:
            'Откуда факт: kpi — отчёт KPI по событиям (строка отчёта с тем ' +
            'же кодом, что в блоке «Планы»); finance — закрытые продажи ' +
            '(как вкладка «Финансы»); airtime и calling вкладка AI не ' +
            'загружает — у них fact = null.',
        enum: PLAN_FACT_SOURCES,
        example: 'kpi',
    })
    factSource: PlanFactSource;

    @ApiProperty({
        description:
            'На какой период руководитель задал значение плана (месяц, ' +
            'квартал или год) — по нему план пересчитан на даты обзора.',
        enum: PLAN_PERIOD_TYPES,
        example: 'month',
    })
    periodType: PlanPeriodType;

    @ApiProperty({
        description:
            'Значение из поля «План: …» сотрудника, как его задал ' +
            'руководитель (на periodType); null — план не задан.',
        type: Number,
        nullable: true,
        example: 30,
    })
    target: number | null;

    @ApiProperty({
        description:
            'План на период обзора: значение приведено к месячной ставке и ' +
            'сложено по месяцам периода (неполный месяц — по доле дней), ' +
            'округлено до сотых — так же, как в блоке «Планы». null — план ' +
            'не задан или не больше нуля.',
        type: Number,
        nullable: true,
        example: 89.16,
    })
    plan: number | null;

    @ApiProperty({
        description:
            'Факт за период обзора; null — источник факта вкладка AI не ' +
            'загружает (эфирное время, звонки по длительности): смотрите ' +
            'блок «Планы» на вкладке KPI.',
        type: Number,
        nullable: true,
        example: 45,
    })
    fact: number | null;

    @ApiProperty({
        description:
            'Выполнение плана долей (0,84 = 84 %), как в блоке «Планы»; ' +
            'null — плана нет или факт не загружен.',
        type: Number,
        nullable: true,
        example: 0.5,
    })
    percent: number | null;
}
