/**
 * DTO кнопок панели «Запуск AI после выкладки»: сброс кэша витрины
 * (`POST admin/ai-analytics/cache/reset`), флаги ступеней
 * (`POST admin/ai-analytics/stage-flags`) и запрос сводки
 * (`GET admin/ai-analytics/launch-status`).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import {
    AI_ANALYTICS_CACHE_SCOPES,
    type AiAnalyticsCacheScope,
} from '../../../contracts/cache.const';
import { AiAnalyticsDomainBodyDto } from '../../dto/ai-analytics-pipeline-admin.dto';
import type { LaunchCacheResetResult } from '../services/ai-analytics-launch-cache.service';
import type {
    LaunchStageFlagsInput,
    LaunchStageFlagsResult,
} from '../services/ai-analytics-launch-stage-flags.service';

/** Сброс кэша витрины AI-аналитики портала. */
export class AiAnalyticsLaunchCacheResetDto extends AiAnalyticsDomainBodyDto {
    @ApiPropertyOptional({
        description:
            'Область сброса: all (по умолчанию) — весь кэш витрины портала, ' +
            'включая периметры доступа; иначе одна секция ключей (pulse — ' +
            'пульс, agenda — повестка, overview — обзоры, settings — ' +
            'настройки и готовность и т. д.) — те же значения, что у ручки ' +
            'kpi-report-sales.',
        enum: AI_ANALYTICS_CACHE_SCOPES,
        default: 'all',
        example: 'all',
    })
    @IsOptional()
    @IsIn(AI_ANALYTICS_CACHE_SCOPES as unknown as string[], {
        message: `scope: допустимы ${AI_ANALYTICS_CACHE_SCOPES.join(', ')}`,
    })
    scope?: AiAnalyticsCacheScope;
}

export class AiAnalyticsLaunchCacheResetResultDto
    implements LaunchCacheResetResult
{
    @ApiProperty({
        description: 'Домен портала, чей кэш сброшен.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Область, по которой прошёл сброс.',
        enum: AI_ANALYTICS_CACHE_SCOPES,
        example: 'all',
    })
    scope: AiAnalyticsCacheScope;

    @ApiProperty({
        description: 'Сколько строк app_cache удалено в БД.',
        example: 12,
        type: Number,
    })
    deletedDb: number;

    @ApiProperty({
        description: 'Сколько ключей удалено в Redis.',
        example: 14,
        type: Number,
    })
    deletedRedis: number;

    @ApiProperty({
        description: 'Итог словами для панели админки.',
        example:
            'Кэш витрины сброшен: удалено записей 12, ключей 14. Пульс, ' +
            'повестка и обзор пересчитаются при следующем открытии вкладки AI.',
        type: String,
    })
    message: string;
}

/** Включение / выключение ступеней «прогноз» и «рекомендации» портала. */
export class AiAnalyticsLaunchStageFlagsDto
    extends AiAnalyticsDomainBodyDto
    implements LaunchStageFlagsInput
{
    @ApiPropertyOptional({
        description:
            'Показывать прогноз отдела в отчёте (forecast_stage_enabled в ' +
            'ai_analytics_model_params). true включается только при pass ' +
            'последней проверки точности, иначе ответ 409 с причинами.',
        example: true,
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean({ message: 'forecast: ожидается true или false' })
    forecast?: boolean;

    @ApiPropertyOptional({
        description:
            'Показывать эффект советов (recommendations_stage_enabled). ' +
            'Гейта здесь нет — решение принимает разработчик по эффекту ' +
            'советов (admin/ai-analytics/recommendation-effect).',
        example: false,
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean({ message: 'recommendations: ожидается true или false' })
    recommendations?: boolean;

    @ApiPropertyOptional({
        description:
            'Включить прогноз в обход проверки точности — только для ' +
            'разработчика (непроверенная вилка у руководителей).',
        example: false,
        default: false,
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean({ message: 'force: ожидается true или false' })
    force?: boolean;
}

export class AiAnalyticsLaunchStageFlagsResultDto
    implements LaunchStageFlagsResult
{
    @ApiProperty({
        description: 'Домен портала.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Прогноз показывается в отчёте после вызова.',
        example: true,
        type: Boolean,
    })
    forecastStageEnabled: boolean;

    @ApiProperty({
        description: 'Эффект советов показывается после вызова.',
        example: false,
        type: Boolean,
    })
    recommendationsStageEnabled: boolean;

    @ApiProperty({
        description:
            'Коды флагов, чьё значение поменялось; пусто — уже было так.',
        example: ['forecast_stage_enabled'],
        type: [String],
    })
    changed: string[];

    @ApiProperty({
        description: 'Прогноз включён принудительно, без пройденной проверки.',
        example: false,
        type: Boolean,
    })
    forced: boolean;

    @ApiProperty({
        description: 'Страница админки, где смотреть прогноз и его проверки.',
        example: '/ai-analytics/model',
        type: String,
    })
    forecastUrl: string;

    @ApiProperty({
        description: 'Итог словами и где смотреть прогноз.',
        example:
            'Прогноз показывается в отчёте. Прогноз отдела — в отчёте ' +
            'kpi-sales: вкладка AI → «Сводка».',
        type: String,
    })
    message: string;
}

/** Запрос сводки запуска по домену портала. */
export class AiAnalyticsLaunchStatusQueryDto extends AiAnalyticsDomainBodyDto {}
