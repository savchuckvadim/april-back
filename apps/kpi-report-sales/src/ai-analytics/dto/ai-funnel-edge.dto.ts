import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    AI_ANALYTICS_GAP_DIRECTIONS,
    AI_ANALYTICS_NORM_FLAGS,
    AiAnalyticsGapDirection,
    AiAnalyticsNormFlag,
} from '../constants/ai-norms.const';
import {
    AI_ANALYTICS_EDGE_ESTIMANDS,
    AI_ANALYTICS_FUNNEL_EDGE_CODES,
    AI_ANALYTICS_PRIOR_SOURCES,
    AiAnalyticsEdgeEstimand,
    AiAnalyticsFunnelEdgeCode,
    AiAnalyticsPriorSource,
} from '../constants/ai-overview.const';
import { MetricDto } from './metric.dto';

/**
 * Ребро воронки менеджера. Фаза 1b отдавала только долю самоотчёта
 * (`priorSource: none`); с Фазы 2, когда есть месячная модель портала,
 * доля усаживается к норме слоя: `rate.value` — апостериор E[θ],
 * `rate.w` — доля собственных данных, `levelNorm` — сама норма,
 * `priorSource` — слой, с которого она взята.
 */
export class AiFunnelEdgeDto {
    @ApiProperty({
        description: 'Код ребра.',
        enum: AI_ANALYTICS_FUNNEL_EDGE_CODES,
        example: 'call_to_presentation',
    })
    edge: AiAnalyticsFunnelEdgeCode;

    @ApiProperty({
        description: 'Подпись ребра.',
        type: String,
        example: 'Звонок → презентация',
    })
    title: string;

    @ApiProperty({
        description: 'Вошло в ребро (знаменатель, факт самоотчёта).',
        type: Number,
        example: 120,
    })
    n: number;

    @ApiProperty({
        description: 'Перешло дальше (числитель).',
        type: Number,
        example: 23,
    })
    s: number;

    @ApiProperty({
        description:
            'Доля s/n (0..1) с интервалом Уилсона; при усадке к норме — ' +
            'апостериор E[θ] и доля собственных данных w; s > n → ' +
            'confidence mixed-sources (числитель и знаменатель из разных ' +
            'событий).',
        type: MetricDto,
    })
    rate: MetricDto;

    @ApiPropertyOptional({
        description:
            'Норма слоя μ (leave-one-out: собственные данные менеджера в ' +
            'неё не входят); нет — модели портала нет.',
        type: Number,
        example: 0.25,
    })
    levelNorm?: number;

    @ApiPropertyOptional({
        description:
            'Норма портала целиком — второй разрыв при norm_stratum = level ' +
            'и при заниженной норме полосы; совпадает с levelNorm, когда ' +
            'норма и так портальная.',
        type: Number,
        example: 0.31,
    })
    portalNorm?: number;

    @ApiPropertyOptional({
        description:
            'Разрыв к норме слоя Δ = E[θ] − μ в единицах ребра (доля или ' +
            'интенсивность); нет — сравнивать не с чем.',
        type: Number,
        example: -0.06,
    })
    gap?: number;

    @ApiPropertyOptional({
        description:
            'Направление разрыва: above — выше нормы, below — ниже, none — ' +
            'интервал разности накрывает ноль либо |Δ| меньше практического ' +
            'порога (5 п.п.).',
        enum: AI_ANALYTICS_GAP_DIRECTIONS,
        example: 'below',
    })
    gapDirection?: AiAnalyticsGapDirection;

    @ApiPropertyOptional({
        description:
            'Трактовка ребра портала: prob — вероятность перехода, rate — ' +
            'интенсивность (числитель и знаменатель из разных зёрен).',
        enum: AI_ANALYTICS_EDGE_ESTIMANDS,
        example: 'prob',
    })
    estimand?: AiAnalyticsEdgeEstimand;

    @ApiPropertyOptional({
        description:
            'Флаг нормы: level_norm_understated — норма полосы ниже 0,7 ' +
            'нормы портала, полоса набрана составом; фронт показывает оба ' +
            'разрыва.',
        enum: AI_ANALYTICS_NORM_FLAGS,
        example: 'level_norm_understated',
    })
    normFlag?: AiAnalyticsNormFlag;

    @ApiProperty({
        description:
            'Источник приора усадки: none — модели нет; tenure — полоса ' +
            'стажа; portal — портал целиком; global — дефолт дампа; pool — ' +
            'межпортальный слой (Фазы 3–4).',
        enum: AI_ANALYTICS_PRIOR_SOURCES,
        example: 'tenure',
    })
    priorSource: AiAnalyticsPriorSource;
}
