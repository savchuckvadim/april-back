import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    AI_BETA_SOURCES,
    AI_TARGET_FLAGS,
    AI_TARGET_SOURCES,
    type AiBetaSource,
    type TargetSource,
} from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_FUNNEL_EDGE_CODES } from '../constants/ai-overview.const';
import {
    AI_DAILY_PLAN_STEP_ORDER,
    AI_DAILY_PLAN_UNREACHABLE,
    AI_DAILY_PLAN_WARNINGS,
} from '../constants/ai-plan.const';
import { MetricDto } from './metric.dto';

/**
 * Части ответа плана дня (план Фазы 2, §5.2, поток 17): цель, строка по
 * типу активности, служебный блок руководителя и шаги объяснения.
 *
 * Файл отделён от `ai-daily-plan.dto.ts` ради правила «файл ≤ 300 строк»
 * (прецедент — пара `ai-rop-mark.dto.ts` / `ai-rop-mark-request.dto.ts`).
 * Union-литералы берутся из `as const` библиотеки: `AI_TARGET_SOURCES`,
 * `AI_TARGET_FLAGS`, `AI_BETA_SOURCES` (ai/rules/pbx-typing.md).
 */

/** Коды оговорок цели: своя (цель не задана) плюс санити библиотеки. */
export const AI_DAILY_PLAN_TARGET_WARNINGS = [
    AI_DAILY_PLAN_WARNINGS.targetEmpty,
    ...AI_TARGET_FLAGS,
] as const;

/** Цель месяца `G` с источником и оговорками. */
export class AiDailyPlanTargetDto {
    @ApiProperty({
        description: 'Цель месяца по продажам, сделок.',
        type: Number,
        example: 6,
    })
    sales: number;

    @ApiProperty({
        description:
            'Источник цели: plan — план руководителя или личная цель; ' +
            'levelTarget — цель уровня; median — медиана полосы стажа.',
        enum: AI_TARGET_SOURCES,
        example: 'plan',
    })
    source: TargetSource;

    @ApiProperty({
        description:
            'Коды оговорок: target-empty — цель не задана ни одной ступенью ' +
            'каскада; wish — цель ниже медианы факта полосы («план = ' +
            'пожелание»); unreachable-by-volume — цель выше потолка полосы × ' +
            'рабочие дни.',
        type: [String],
        enum: AI_DAILY_PLAN_TARGET_WARNINGS,
        isArray: true,
        example: ['wish'],
    })
    warnings: string[];
}

/** Строка плана по одному типу активности. */
export class AiDailyPlanItemDto {
    @ApiProperty({
        description:
            'Код типа активности (ребра воронки) из AI_ANALYTICS_FUNNEL_EDGES.',
        type: String,
        enum: AI_ANALYTICS_FUNNEL_EDGE_CODES,
        example: 'call_to_presentation',
    })
    callType: string;

    @ApiProperty({
        description: 'Название типа активности для витрины.',
        type: String,
        example: 'Звонок → презентация',
    })
    title: string;

    @ApiProperty({
        description:
            'Сколько сделать сегодня: равномерный остаток месяца, ' +
            'ограниченный потолком дня (plan_day_ceiling × план месяца ÷ ' +
            'рабочие дни месяца).',
        type: Number,
        example: 12.5,
    })
    requiredToday: number;

    @ApiProperty({
        description: 'Уже сделано сегодня.',
        type: Number,
        example: 4,
    })
    doneToday: number;

    @ApiProperty({
        description:
            'План месяца по типу: сделано плюс требуемый остаток, но не ' +
            'ниже обучающего минимума.',
        type: Number,
        example: 250,
    })
    monthPlan: number;

    @ApiProperty({
        description: 'Сделано за месяц.',
        type: Number,
        example: 120,
    })
    monthDone: number;

    @ApiProperty({
        description:
            'Потолок дневного темпа полосы стажа (p90); null — не оценён.',
        type: Number,
        nullable: true,
        example: 25,
    })
    cap: number | null;

    @ApiProperty({
        description: 'Место в приоритете по утечке ребра, начиная с 1.',
        type: Number,
        example: 1,
    })
    priority: number;
}

/** Служебные числа руководителя (менеджеру не отдаются). */
export class AiDailyPlanRopOnlyDto {
    @ApiProperty({
        description:
            'Норма входного ребра менеджера (leave-one-out): μ слоя, объём ' +
            'и доля собственных данных; value = null — данных мало.',
        type: MetricDto,
    })
    norm: MetricDto;

    @ApiProperty({
        description:
            'Норма при опорном качестве S_ref — p̂(S_ref). null — режим ' +
            'betaSource не data: связи «качество → исход» нет, и качество ' +
            'на строки плана не влияет.',
        type: Number,
        nullable: true,
        example: null,
    })
    normAtRefQuality: number | null;

    @ApiProperty({
        description:
            'Режим связи качества с исходом: none — связи нет; hypothesis — ' +
            'гипотеза портала (только калькулятор «что если»); data — оценка ' +
            'по данным.',
        enum: AI_BETA_SOURCES,
        example: 'none',
    })
    betaSource: AiBetaSource;

    @ApiPropertyOptional({
        description:
            'Код ребра, которое первым упирается в потолок дневного темпа: ' +
            'лечить остальные бесполезно. Не передано — не упирается.',
        type: String,
        enum: AI_ANALYTICS_FUNNEL_EDGE_CODES,
        example: 'call_to_presentation',
    })
    bindingConstraint?: string;

    @ApiPropertyOptional({
        description:
            'Почему цель недостижима: cap-exceeded — требуемый темп выше ' +
            'потолка; no-days-left — рабочих дней не осталось; ' +
            'edge-theta-zero — разворот упёрся в θ = 0.',
        enum: Object.values(AI_DAILY_PLAN_UNREACHABLE),
        example: AI_DAILY_PLAN_UNREACHABLE.capExceeded,
    })
    unreachable?: string;

    @ApiProperty({
        description: 'G′ — ожидание месяца по медиане дневного темпа.',
        type: Number,
        example: 4.2,
    })
    gExpected: number;

    @ApiProperty({
        description: 'G′ — потолок месяца по capacity полосы стажа.',
        type: Number,
        example: 6.1,
    })
    gCeiling: number;

    @ApiPropertyOptional({
        description:
            'S_req — качество, при котором цель берётся текущим объёмом. ' +
            'Не передано — вне режима data этого числа нет.',
        type: Number,
        example: 8.2,
    })
    sReq?: number;
}

/** Шаг объяснения «как получилось это число». */
export class AiDailyPlanStepDto {
    @ApiProperty({
        description:
            'Код шага в порядке расчёта: target (G) → done_sales (Y₀) → ' +
            'pipeline_expected (λ_pipe) → required_volume (N_req) → unwind ' +
            '(разворот по рёбрам) → ceiling (потолок дня).',
        enum: AI_DAILY_PLAN_STEP_ORDER,
        example: 'target',
    })
    code: string;

    @ApiProperty({
        description:
            'Число шага; null — величина не определена (например, λ_pipe ' +
            'без истории стадий). Каждое число шага есть и в самом DTO.',
        type: Number,
        nullable: true,
        example: 6,
    })
    value: number | null;

    @ApiProperty({
        description: 'Текст шага для витрины «Как считаем».',
        type: String,
        example: 'Цель месяца: 6,0.',
    })
    text: string;
}

/** Объяснение расчёта: шаги по порядку и связный текст. */
export class AiDailyPlanExplanationDto {
    @ApiProperty({
        description:
            'Шаги расчёта в порядке G → Y₀ → λ_pipe → N_req → разворот → ' +
            'потолок.',
        type: [AiDailyPlanStepDto],
    })
    steps: AiDailyPlanStepDto[];

    @ApiProperty({
        description: 'Те же шаги одной строкой — для карточки и уведомления.',
        type: String,
        example:
            'Цель месяца: 6,0. Закрыто: 2,0. От пайплайна: 1,2. Нужно ' +
            'активностей до конца месяца: 190,0.',
    })
    text: string;
}
