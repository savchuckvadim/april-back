import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    ArrayMaxSize,
    IsArray,
    IsOptional,
    IsString,
    Matches,
} from 'class-validator';
import {
    PLAN_FACT_INDICATORS,
    PLAN_FACT_REASONS,
    PLAN_FACT_STATUSES,
    type PlanFactIndicator,
    type PlanFactReason,
    type PlanFactStatus,
} from '@lib/sales-ai-analytics';
import {
    AI_PLAN_FACT_MANAGERS_MAX,
    AI_PLAN_FACT_REASONS,
} from '../constants/ai-plan-fact.const';
import { AiAnalyticsEnvelopeDto } from './ai-response-envelope.dto';
import { AiRequestBaseDto } from './ai-request-base.dto';

/** Причины деградации уровня ручки — для Swagger-перечисления. */
const PLAN_FACT_VIEW_REASONS = Object.values(AI_PLAN_FACT_REASONS);

/** Причины уровня строки — для Swagger-перечисления. */
const PLAN_FACT_ROW_REASONS = Object.values(PLAN_FACT_REASONS);

/** Запрос реконсиляции план-факт за месяц. */
export class AiPlanFactRequestDto extends AiRequestBaseDto {
    @ApiProperty({
        description:
            'Месяц реконсиляции в формате YYYY-MM. Закрытый месяц ' +
            'читается из кэша без обращения к Битриксу, текущий — ' +
            'пересчитывается раз в несколько минут.',
        type: String,
        example: '2026-09',
    })
    @IsString()
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
        message: 'monthKey должен быть в формате YYYY-MM',
    })
    monthKey: string;

    @ApiPropertyOptional({
        description:
            'Bitrix-id менеджеров, которых нужно свести. Не передан — ' +
            'весь периметр запросившего. Менеджеры вне периметра ' +
            'отбрасываются молча, а не дают 403.',
        type: [String],
        example: ['447', '512'],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(AI_PLAN_FACT_MANAGERS_MAX, {
        message: `managerIds: не больше ${AI_PLAN_FACT_MANAGERS_MAX} менеджеров в запросе`,
    })
    @IsString({ each: true })
    managerIds?: string[];
}

/**
 * Строка реконсиляции по одному показателю. Ни одного числа без плана:
 * при `status = no-plan` темп, прогноз, разрыв и дневная норма — null,
 * а причина лежит в `reasons`.
 */
export class AiPlanFactRowDto {
    @ApiProperty({
        description:
            'Показатель: sales — продажи (закрытые сделки), calls — ' +
            'звонки, presentations — презентации. Денежного плана в ' +
            'реконсиляции нет (решение владельца В6 от 22.09.2026).',
        enum: PLAN_FACT_INDICATORS,
        example: 'sales',
    })
    indicator: PlanFactIndicator;

    @ApiProperty({
        description:
            'Цель месяца из снимка планов руководителя; null — цель не ' +
            'задана или снимка за месяц нет.',
        type: Number,
        nullable: true,
        example: 10,
    })
    plan: number | null;

    @ApiProperty({
        description:
            'Факт на дату расчёта из месячного снапшота менеджера; ' +
            'null — месяц менеджера ещё не рассчитан.',
        type: Number,
        nullable: true,
        example: 6,
    })
    fact: number | null;

    @ApiProperty({
        description:
            'Темп: факт, делённый на ту долю плана, которая должна быть ' +
            'сделана к этому дню по рабочим дням календаря портала. ' +
            '1 — идём ровно по плану, ниже — отстаём. null — плана нет, ' +
            'факта нет или рабочих дней в месяце ноль.',
        type: Number,
        nullable: true,
        example: 1.2,
    })
    pace: number | null;

    @ApiProperty({
        description:
            'Описательный прогноз закрытия месяца при текущем темпе, ' +
            'срезанный потолком дня plan_day_ceiling: догонять месяц ' +
            'бесконечным рывком нельзя. null — считать не из чего.',
        type: Number,
        nullable: true,
        example: 11.4,
    })
    forecastP50: number | null;

    @ApiProperty({
        description:
            'Разрыв «план минус прогноз»; отрицательный — прогноз выше ' +
            'плана. null — прогноза нет.',
        type: Number,
        nullable: true,
        example: -1.4,
    })
    gap: number | null;

    @ApiProperty({
        description:
            'Сколько нужно в день на оставшиеся рабочие дни, чтобы ' +
            'закрыть план. null — плана нет, рабочих дней не осталось ' +
            'или на портале выключен признак «План дня».',
        type: Number,
        nullable: true,
        example: 0.4,
    })
    perDayNeeded: number | null;

    @ApiProperty({
        description:
            'Итог строки: on-track — внутри практической полосы вокруг ' +
            'плана (delta_prac_pct), behind — отстаём, ahead — ' +
            'опережаем, no-plan — цели нет или факта нет.',
        enum: PLAN_FACT_STATUSES,
        example: 'on-track',
    })
    status: PlanFactStatus;

    @ApiProperty({
        description:
            'Почему в строке нет чисел: plan-missing — менеджера нет в ' +
            'снимке целей, target-empty — цель ноль, fact-missing — ' +
            'месяц не рассчитан, no-workdays — рабочих дней в месяце ' +
            'ноль, no-days-left — месяц кончился, daily-plan-disabled — ' +
            'дневная разбивка выключена. Пусто — все числа посчитаны.',
        enum: PLAN_FACT_ROW_REASONS,
        isArray: true,
        example: [],
    })
    reasons: PlanFactReason[];
}

/** Строки одного менеджера. */
export class AiPlanFactManagerDto {
    @ApiProperty({
        description: 'Bitrix-id менеджера.',
        type: String,
        example: '512',
    })
    managerId: string;

    @ApiProperty({
        description:
            'Строки по показателям в порядке справочника: продажи, ' +
            'звонки, презентации.',
        type: [AiPlanFactRowDto],
    })
    rows: AiPlanFactRowDto[];
}

/** Период реконсиляции: месяц и его рабочие дни. */
export class AiPlanFactPeriodDto {
    @ApiProperty({
        description: 'Месяц реконсиляции YYYY-MM.',
        type: String,
        example: '2026-09',
    })
    monthKey: string;

    @ApiProperty({
        description: 'Рабочих дней в месяце по календарю портала.',
        type: Number,
        example: 22,
    })
    workdaysInMonth: number;

    @ApiProperty({
        description:
            'Рабочих дней месяца, прошедших к дате расчёта включительно. ' +
            'Для закрытого месяца равно всем рабочим дням.',
        type: Number,
        example: 15,
    })
    workdaysElapsed: number;

    @ApiProperty({
        description:
            'Дата расчёта YYYY-MM-DD в часовом поясе портала — от неё ' +
            'считается прошедшая доля месяца.',
        type: String,
        example: '2026-09-22',
    })
    today: string;

    @ApiProperty({
        description:
            'Месяц закрыт: снапшоты заморожены, результат лежит в кэше ' +
            'долго и Битрикс не опрашивается.',
        type: Boolean,
        example: false,
    })
    closed: boolean;
}

/** Реконсиляция план-факт за месяц: строки менеджеров и свод отдела. */
export class AiPlanFactDto {
    @ApiProperty({
        description: 'Период реконсиляции и его рабочие дни.',
        type: AiPlanFactPeriodDto,
    })
    period: AiPlanFactPeriodDto;

    @ApiProperty({
        description:
            'Менеджеры периметра с их строками. Порядок — как в ' +
            'запросе, иначе по возрастанию Bitrix-id.',
        type: [AiPlanFactManagerDto],
    })
    rows: AiPlanFactManagerDto[];

    @ApiProperty({
        description:
            'Свод отдела: планы и факты менеджеров сложены по ' +
            'показателям, темп и прогноз посчитаны от суммы. Сумма fact ' +
            'по менеджерам равна факту отдела по построению.',
        type: [AiPlanFactRowDto],
    })
    team: AiPlanFactRowDto[];

    @ApiProperty({
        description:
            'Почему часть чисел отсутствует целиком по ручке: ' +
            'plan-snapshot-missing — снимка целей за месяц нет, ' +
            'manager-month-missing — месяцы менеджеров не рассчитаны, ' +
            'daily-plan-disabled — «сколько надо в день» выключено ' +
            'настройкой портала. Пусто — данные полные.',
        enum: PLAN_FACT_VIEW_REASONS,
        isArray: true,
        example: [],
    })
    reasons: string[];

    @ApiProperty({
        description:
            'Человеческие подписи причин из reasons в том же порядке — ' +
            'их показывает витрина вместо пустых клеток.',
        type: [String],
        example: [],
    })
    reasonTexts: string[];
}

/** Конверт ответа ручки реконсиляции план-факт. */
export class AiPlanFactResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiPropertyOptional({
        description: 'Реконсиляция при status = ready.',
        type: AiPlanFactDto,
    })
    data?: AiPlanFactDto;
}
