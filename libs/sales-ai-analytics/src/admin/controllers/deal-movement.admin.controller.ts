/**
 * Админ-ручки движения сделок (этап 7.3): прогон портала — «Посчитать»
 * или внеочередной ночной счёт (джоба в очереди event-sales) — и его
 * состояние. В сделки ничего не пишется. Только apps/admin через
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
    AiAnalyticsDealMovementRunDto,
    AiAnalyticsDealMovementRunResultDto,
} from '../dto/ai-analytics-deal-movement.dto';
import {
    AiAnalyticsDealMovementStatusDto,
    AiAnalyticsDealMovementStatusQueryDto,
} from '../dto/ai-analytics-deal-movement-status.dto';
import { AiAnalyticsDealMovementService } from '../services/ai-analytics-deal-movement.service';

/** Пути ручек движения сделок (один источник для контроллера и спек). */
export const AI_ANALYTICS_DEAL_MOVEMENT_ROUTES = {
    run: 'deal-movement',
    status: 'deal-movement-status',
} as const;

@ApiTags(AI_ANALYTICS_ADMIN_TAG)
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AI_ANALYTICS_ADMIN_ROLES)
@Controller(AI_ANALYTICS_ADMIN_PATH)
export class AiAnalyticsDealMovementAdminController {
    constructor(private readonly movement: AiAnalyticsDealMovementService) {}

    @Post(AI_ANALYTICS_DEAL_MOVEMENT_ROUTES.run)
    @HttpCode(200)
    @ApiOperation({
        summary: 'Посчитать движение сделок портала',
        description:
            'Ставит прогон в очередь event-sales: статусы всех открытых ' +
            'сделок «ОП Основная» (движется, застряла, откатилась, под ' +
            'риском) по стадиям и разобранным звонкам. dryRun: true — ' +
            'подсчёт без сохранения, итог в состоянии прогона; dryRun: false ' +
            '— внеочередной ночной счёт: состояние и снимок дня сохраняются. ' +
            'В сделки ничего не пишется. Пока прогон портала того же режима ' +
            'ждёт или идёт, второй не ставится.',
    })
    @ApiBody({
        type: AiAnalyticsDealMovementRunDto,
        description: 'Домен портала и режим прогона.',
    })
    @ApiOkResponse({
        type: AiAnalyticsDealMovementRunResultDto,
        description: 'Поставлен ли прогон, его джоба или причина отказа.',
    })
    async run(
        @Body() dto: AiAnalyticsDealMovementRunDto,
    ): Promise<AiAnalyticsDealMovementRunResultDto> {
        return this.movement.run({ domain: dto.domain, dryRun: dto.dryRun });
    }

    @Get(AI_ANALYTICS_DEAL_MOVEMENT_ROUTES.status)
    @ApiOperation({
        summary: 'Состояние движения сделок портала',
        description:
            'Включён ли ночной счёт, ход и итог последнего прогона (сколько ' +
            'открыто и оценено, счёт по статусам, смены за ночь, ' +
            'предупреждения) и последний сохранённый снимок дня со сменами ' +
            'статуса словами.',
    })
    @ApiOkResponse({
        type: AiAnalyticsDealMovementStatusDto,
        description: 'Состояние движения сделок портала.',
    })
    async status(
        @Query() query: AiAnalyticsDealMovementStatusQueryDto,
    ): Promise<AiAnalyticsDealMovementStatusDto> {
        return this.movement.status(query.domain);
    }
}
