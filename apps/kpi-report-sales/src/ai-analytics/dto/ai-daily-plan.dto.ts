import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AI_DAILY_PLAN_REASONS } from '../constants/ai-plan.const';
import {
    AiDailyPlanExplanationDto,
    AiDailyPlanItemDto,
    AiDailyPlanRopOnlyDto,
    AiDailyPlanTargetDto,
} from './ai-daily-plan-parts.dto';
import { AiRequestBaseDto } from './ai-request-base.dto';
import { AiAnalyticsEnvelopeDto } from './ai-response-envelope.dto';

/**
 * Ручка плана дня (план Фазы 2, §4.9 и §5.2, поток 17): обратная задача
 * «от цели месяца к активностям сегодня». Ответ синхронный и считается по
 * уже записанным снапшотам (прогноз дня, модель портала, месяц
 * менеджера) — в Битрикс ручка не ходит.
 *
 * Менеджер видит свой план без служебных чисел; руководителю добавляется
 * блок `ropOnly` (нормы, связь качества с исходом, два `G′` и связующее
 * ограничение). Части ответа — в `ai-daily-plan-parts.dto.ts`.
 */
export {
    AI_DAILY_PLAN_TARGET_WARNINGS,
    AiDailyPlanExplanationDto,
    AiDailyPlanItemDto,
    AiDailyPlanRopOnlyDto,
    AiDailyPlanStepDto,
    AiDailyPlanTargetDto,
} from './ai-daily-plan-parts.dto';

/** Запрос плана дня: чей план и на какой день. */
export class AiDailyPlanRequestDto extends AiRequestBaseDto {
    @ApiPropertyOptional({
        description:
            'Bitrix-id менеджера, чей план запрашивается. Не передан — план ' +
            'самого requester’а. Менеджер вне периметра видимости — 403.',
        type: String,
        example: '447',
    })
    @IsOptional()
    @IsString()
    @MaxLength(32)
    managerId?: string;

    @ApiPropertyOptional({
        description:
            'День плана в TZ портала (YYYY-MM-DD). Не передан — сегодня.',
        type: String,
        example: '2026-09-08',
    })
    @IsOptional()
    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date должна быть YYYY-MM-DD' })
    date?: string;
}

/** План дня менеджера. */
export class AiDailyPlanDto {
    @ApiProperty({
        description: 'Bitrix-id менеджера, чей это план.',
        type: String,
        example: '447',
    })
    managerId: string;

    @ApiProperty({
        description: 'День плана в TZ портала (YYYY-MM-DD).',
        type: String,
        example: '2026-09-08',
    })
    date: string;

    @ApiProperty({
        description: 'Цель месяца, её источник и оговорки.',
        type: AiDailyPlanTargetDto,
    })
    target: AiDailyPlanTargetDto;

    @ApiProperty({
        description: 'Y₀ — закрытые продажи месяца, сделок.',
        type: Number,
        example: 2,
    })
    doneSales: number;

    @ApiProperty({
        description:
            'λ_pipe — ожидание продаж от открытого пайплайна. null — истории ' +
            'стадий нет, и цель на пайплайн НЕ уменьшается: ноль означал бы ' +
            '«пайплайн пуст», а это неправда.',
        type: Number,
        nullable: true,
        example: 1.2,
    })
    pipelineExpected: number | null;

    @ApiProperty({
        description:
            'N_req — требуемый объём входной активности до конца месяца; его ' +
            'разворот по рёбрам воронки и даёт строки плана. null — план ' +
            'построен по объёму (см. reason): обратную задачу не решали, и ' +
            'ноль здесь читался бы как «делать нечего».',
        type: Number,
        nullable: true,
        example: 190,
    })
    requiredVolume: number | null;

    @ApiProperty({
        description: 'Рабочих дней до конца месяца, включая сегодня.',
        type: Number,
        example: 15,
    })
    daysLeft: number;

    @ApiProperty({
        description: 'Строки плана по типам активности, по приоритету утечки.',
        type: [AiDailyPlanItemDto],
    })
    items: AiDailyPlanItemDto[];

    @ApiPropertyOptional({
        description:
            'Служебные числа руководителя; менеджеру блок не отдаётся.',
        type: AiDailyPlanRopOnlyDto,
    })
    ropOnly?: AiDailyPlanRopOnlyDto;

    @ApiProperty({
        description: 'Как получилось каждое число плана.',
        type: AiDailyPlanExplanationDto,
    })
    explanation: AiDailyPlanExplanationDto;

    @ApiProperty({
        description:
            'Код штатной деградации: portal-model-missing — модели портала ' +
            'нет, нормы не показываем и план считаем по объёму; ' +
            'forecast-missing — нет прогноза за этот день; ' +
            'manager-month-missing — нет месяца менеджера. null — посчитано ' +
            'по полным данным.',
        enum: Object.values(AI_DAILY_PLAN_REASONS),
        nullable: true,
        example: null,
    })
    reason: string | null;
}

/** Конверт ответа ручки плана дня. */
export class AiDailyPlanResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiPropertyOptional({
        description: 'План дня при status = ready.',
        type: AiDailyPlanDto,
    })
    data?: AiDailyPlanDto;
}
