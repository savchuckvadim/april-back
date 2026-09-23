import { ApiProperty } from '@nestjs/swagger';
import {
    SAME_PERIOD_REASONS,
    type SamePeriodReason,
} from '@lib/sales-ai-analytics';
import { MetricDto } from './metric.dto';

/** Коды причин несопоставимости пары периодов — реестр библиотеки. */
export const AI_YOY_REASONS: readonly SamePeriodReason[] =
    Object.values(SAME_PERIOD_REASONS);

/** Коды величин, которые сравниваются год назад. */
export const AI_YOY_METRICS = [
    'quality',
    'analyzed_calls',
    'sales_count',
    'sales_sum',
    'average_check',
] as const;
export type AiYoyMetric = (typeof AI_YOY_METRICS)[number];

/**
 * Одна величина в двух периодах: месяц витрины и тот же месяц год назад.
 * Показывается описательно — «столько было, столько стало»; оценки
 * («лучше», «хуже», любые слова о весомости разницы) здесь нет и
 * появиться не должно: чтобы судить о разнице, нужен разбор причин, а
 * его даёт руководитель.
 *
 * Обе величины — обычные метрики витрины с «честным мало данных»: при
 * объёме меньше `n_min_none` `value = null`, и тогда ни одного числа
 * наружу не уходит.
 */
export class AiYoyMetricDto {
    @ApiProperty({
        description:
            'Код величины: quality — средняя оценка разговора 1–10, ' +
            'analyzed_calls — разборов за месяц, sales_count — закрытых ' +
            'сделок, sales_sum — сумма закрытых продаж (₽), ' +
            'average_check — средний чек (₽).',
        enum: AI_YOY_METRICS,
        example: 'quality',
    })
    metric: AiYoyMetric;

    @ApiProperty({
        description: 'Величина за месяц витрины.',
        type: MetricDto,
    })
    current: MetricDto;

    @ApiProperty({
        description: 'Та же величина за тот же месяц год назад.',
        type: MetricDto,
    })
    base: MetricDto;

    @ApiProperty({
        description:
            'Разница «сейчас минус год назад» в единицах величины; null — ' +
            'хотя бы в одном периоде данных меньше порога показа.',
        type: Number,
        nullable: true,
        example: 0.6,
    })
    delta: number | null;
}

/**
 * Блок «год назад» (план Фазы 3, П3): тот же календарный месяц годом
 * ранее из снапшота `ai-analytics-manager-month` M−12 и флаг
 * сопоставимости с причинами.
 *
 * Решение владельца В9 (22.09.2026): если год назад менеджер работал в
 * другом отделе или был на другом уровне — сравнение идёт **с ним же**,
 * но `comparable: false` с причиной; человека не подменяют и блок не
 * прячут. Блок целиком равен `null`, когда сравнивать нечего: период
 * витрины не месяц (`period-not-month`) либо истории меньше 13 месяцев
 * (`no-history`).
 */
export class AiYoyDto {
    @ApiProperty({
        description: 'Месяц витрины YYYY-MM.',
        type: String,
        example: '2026-09',
    })
    periodKey: string;

    @ApiProperty({
        description: 'Тот же месяц год назад YYYY-MM.',
        type: String,
        example: '2025-09',
    })
    basePeriodKey: string;

    @ApiProperty({
        description:
            'Числа периодов можно ставить рядом без оговорок: версии ' +
            'разбора те же, сравнимая история не рвалась, состав и уровень ' +
            'менеджера не менялись, событий портала между периодами нет.',
        type: Boolean,
        example: true,
    })
    comparable: boolean;

    @ApiProperty({
        description:
            'Причины несопоставимости: versions-changed — сменились версии ' +
            'разбора, before-comparable — граница сравнимой истории прошла ' +
            'внутри года, department-changed / level-changed / ' +
            'tenure-band-changed — год назад менеджер был в другом отделе, ' +
            'на другом уровне либо в другой полосе стажа (В9), ' +
            'portal-event — между периодами есть событие журнала портала. ' +
            'Пусто — оговорок нет.',
        enum: AI_YOY_REASONS,
        isArray: true,
        example: ['department-changed'],
    })
    reasons: SamePeriodReason[];

    @ApiProperty({
        description:
            'Величины обоих периодов в порядке реестра; пусто — в обоих ' +
            'периодах данных меньше порога показа.',
        type: [AiYoyMetricDto],
    })
    metrics: AiYoyMetricDto[];
}
