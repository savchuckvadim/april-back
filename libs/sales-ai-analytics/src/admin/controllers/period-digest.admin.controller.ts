/**
 * Админ-ручки итогов периода по менеджерам (этап 7.4): подсчёт недели или
 * месяца (джоба в очереди event-sales) и состояние — настройки портала и
 * итог последнего прогона по видам периода. Только apps/admin через
 * `SalesAiAnalyticsAdminModule` (ai/rules/app-api-surface.md), DTO — по
 * ai/rules/dto-conventions.md.
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
    ApiBearerAuth,
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard } from '@lib/auth';
import {
    AI_ANALYTICS_ADMIN_PATH,
    AI_ANALYTICS_ADMIN_ROLES,
    AI_ANALYTICS_ADMIN_TAG,
} from './admin-controller.const';
import {
    AiAnalyticsPeriodDigestRunDto,
    AiAnalyticsPeriodDigestRunResultDto,
} from '../dto/ai-analytics-period-digest.dto';
import {
    AiAnalyticsPeriodDigestStatusDto,
    AiAnalyticsPeriodDigestStatusQueryDto,
} from '../dto/ai-analytics-period-digest-status.dto';
import { AiAnalyticsPeriodDigestService } from '../services/ai-analytics-period-digest.service';

/** Пути ручек итогов периода (один источник для контроллера и спек). */
export const AI_ANALYTICS_PERIOD_DIGEST_ROUTES = {
    run: 'period-digest',
    status: 'period-digest-status',
} as const;

@ApiTags(AI_ANALYTICS_ADMIN_TAG)
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AI_ANALYTICS_ADMIN_ROLES)
@Controller(AI_ANALYTICS_ADMIN_PATH)
export class AiAnalyticsPeriodDigestAdminController {
    constructor(private readonly digests: AiAnalyticsPeriodDigestService) {}

    @Post(AI_ANALYTICS_PERIOD_DIGEST_ROUTES.run)
    @HttpCode(200)
    @ApiOperation({
        summary: 'Посчитать итоги периода по менеджерам портала',
        description:
            'Ставит подсчёт в очередь event-sales: карточка на каждого ' +
            'менеджера отдела продаж за неделю или месяц — метрики, ' +
            'сравнение с прошлым периодом и отделом словами, рекомендации с ' +
            'целями — сохраняется снимком, итог приходит в Telegram команды. ' +
            'Задачи руководителям не ставятся (подключаются следующим ' +
            'этапом). Без ключа периода — последняя закрытая неделя или ' +
            'месяц. Идёт вне расписания и независимо от «включено»; пока ' +
            'подсчёт того же вида ждёт или идёт, второй не ставится.',
    })
    @ApiBody({
        type: AiAnalyticsPeriodDigestRunDto,
        description: 'Домен портала, вид периода и (необязательно) ключ.',
    })
    @ApiOkResponse({
        type: AiAnalyticsPeriodDigestRunResultDto,
        description: 'Поставлен ли подсчёт, его джоба или причина отказа.',
    })
    async run(
        @Body() dto: AiAnalyticsPeriodDigestRunDto,
    ): Promise<AiAnalyticsPeriodDigestRunResultDto> {
        return this.digests.run({
            domain: dto.domain,
            kind: dto.kind,
            ...(dto.periodKey ? { periodKey: dto.periodKey } : {}),
        });
    }

    @Get(AI_ANALYTICS_PERIOD_DIGEST_ROUTES.status)
    @ApiOperation({
        summary: 'Состояние итогов периода портала',
        description:
            'Включены ли итоги, «только считать», отмеченные виды периодов ' +
            'и итог последнего прогона по неделе и месяцу: период, момент, ' +
            'строки итога, предупреждения или причина сбоя.',
    })
    @ApiOkResponse({
        type: AiAnalyticsPeriodDigestStatusDto,
        description: 'Состояние итогов периода портала.',
    })
    async status(
        @Query() query: AiAnalyticsPeriodDigestStatusQueryDto,
    ): Promise<AiAnalyticsPeriodDigestStatusDto> {
        return this.digests.status(query.domain);
    }
}
