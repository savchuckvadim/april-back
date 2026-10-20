/**
 * Админ-ручки панели «Запуск AI после выкладки» (запрос владельца
 * 21.10.2026: «большие очевидные кнопки» вместо Swagger и токенов):
 * сброс кэша витрины, флаги ступеней прогноза/рекомендаций и сводка
 * состояния запуска одним ответом. Остальные кнопки панели зовут уже
 * существующие ручки (backfill, recompute, forecast-backtest, reanalyze,
 * install-aicall). Только apps/admin (ai/rules/app-api-surface.md).
 */
import {
    Body,
    Controller,
    Get,
    HttpCode,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiBody,
    ApiConflictResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard } from '@lib/auth';
import {
    AI_ANALYTICS_ADMIN_PATH,
    AI_ANALYTICS_ADMIN_ROLES,
    AI_ANALYTICS_ADMIN_TAG,
} from '../controllers/admin-controller.const';
import {
    AiAnalyticsLaunchCacheResetDto,
    AiAnalyticsLaunchCacheResetResultDto,
    AiAnalyticsLaunchStageFlagsDto,
    AiAnalyticsLaunchStageFlagsResultDto,
    AiAnalyticsLaunchStatusQueryDto,
} from './dto/ai-analytics-launch-actions.dto';
import { AiAnalyticsLaunchStatusDto } from './dto/ai-analytics-launch-status.dto';
import { AI_ANALYTICS_LAUNCH_ROUTES } from './launch.const';
import { AiAnalyticsLaunchCacheService } from './services/ai-analytics-launch-cache.service';
import { AiAnalyticsLaunchStageFlagsService } from './services/ai-analytics-launch-stage-flags.service';
import { AiAnalyticsLaunchStatusService } from './services/ai-analytics-launch-status.service';

@ApiTags(AI_ANALYTICS_ADMIN_TAG)
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AI_ANALYTICS_ADMIN_ROLES)
@Controller(AI_ANALYTICS_ADMIN_PATH)
export class AiAnalyticsLaunchAdminController {
    constructor(
        private readonly cache: AiAnalyticsLaunchCacheService,
        private readonly stageFlags: AiAnalyticsLaunchStageFlagsService,
        private readonly launchStatus: AiAnalyticsLaunchStatusService,
    ) {}

    @ApiOperation({
        summary: 'Сбросить кэш витрины AI портала',
        description:
            'Та же очистка, что у POST ai-analytics/cache/reset приложения ' +
            'kpi-report-sales, но из админки (SUPER_USER, без ' +
            'requesterUserId): строки app_cache и ключи Redis пространства ' +
            'sales-ai-analytics:v1 по домену. scope = all (по умолчанию) — ' +
            'весь кэш витрины, иначе одна секция. Нужен после выкладки и ' +
            'после переразбора — иначе пульс и повестка отдают старый расчёт ' +
            'до истечения TTL (час / 15 минут).',
    })
    @ApiBody({
        type: AiAnalyticsLaunchCacheResetDto,
        description: 'Домен портала и область сброса.',
    })
    @ApiOkResponse({
        description: 'Сколько удалено в БД и Redis, итог словами.',
        type: AiAnalyticsLaunchCacheResetResultDto,
    })
    @Post(AI_ANALYTICS_LAUNCH_ROUTES.cacheReset)
    @HttpCode(200)
    async resetCache(
        @Body() dto: AiAnalyticsLaunchCacheResetDto,
    ): Promise<AiAnalyticsLaunchCacheResetResultDto> {
        return this.cache.reset(dto.domain, dto.scope ?? 'all');
    }

    @ApiOperation({
        summary: 'Включить / выключить показ прогноза и эффекта советов',
        description:
            'Безопасно мёржит forecast_stage_enabled и ' +
            'recommendations_stage_enabled в JSON ai_analytics_model_params ' +
            'портала: текущее значение читается из БД, меняются только эти ' +
            'ключи, сохраняется тем же сервисом, что форма настроек админки. ' +
            'Битый JSON — 400 с текстом, ничего не перезаписывается. ' +
            'forecast = true — только если последняя проверка точности ' +
            'прогноза в статусе pass, иначе 409 с причинами; force = true — ' +
            'обход для разработчика. После смены флага сбрасывается кэш ' +
            'витрины портала (сбой сброса — подсказка в message).',
    })
    @ApiBody({
        type: AiAnalyticsLaunchStageFlagsDto,
        description: 'Домен и флаги; не переданный флаг не меняется.',
    })
    @ApiOkResponse({
        description:
            'Новые значения флагов, что поменялось и где смотреть прогноз.',
        type: AiAnalyticsLaunchStageFlagsResultDto,
    })
    @ApiBadRequestResponse({
        description: 'Флаги не заданы или JSON настроек модели портала битый.',
    })
    @ApiConflictResponse({
        description:
            'Проверка точности прогноза не пройдена (причины в тексте).',
    })
    @Post(AI_ANALYTICS_LAUNCH_ROUTES.stageFlags)
    @HttpCode(200)
    async setStageFlags(
        @Body() dto: AiAnalyticsLaunchStageFlagsDto,
    ): Promise<AiAnalyticsLaunchStageFlagsResultDto> {
        return this.stageFlags.apply({
            domain: dto.domain,
            ...(dto.forecast === undefined ? {} : { forecast: dto.forecast }),
            ...(dto.recommendations === undefined
                ? {}
                : { recommendations: dto.recommendations }),
            ...(dto.force === undefined ? {} : { force: dto.force }),
        });
    }

    @ApiOperation({
        summary: 'Сводка запуска AI после выкладки',
        description:
            'Одним ответом для панели запуска: настройки (AI-аналитика, ' +
            'разбор звонков, пилот), смарт (установлен ли, есть ли значения ' +
            'door_closed и event_invite), журнал прогонов (последние ' +
            'backfill / monthly / nightly), прогноз (теневые месяцы, из ' +
            'истории, статус проверки, флаг показа), последний переразбор по ' +
            'домену с прогрессом и расход модели за месяц. У каждого блока — ' +
            'state (done | todo | running | unknown) и текст «что это и что ' +
            'сделать дальше». Только чтение; упавшее чтение даёт unknown ' +
            'своему блоку, остальные собираются.',
    })
    @ApiOkResponse({
        description: 'Блоки состояния запуска.',
        type: AiAnalyticsLaunchStatusDto,
    })
    @Get(AI_ANALYTICS_LAUNCH_ROUTES.status)
    async status(
        @Query() query: AiAnalyticsLaunchStatusQueryDto,
    ): Promise<AiAnalyticsLaunchStatusDto> {
        return this.launchStatus.status(query.domain);
    }
}
