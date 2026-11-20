/**
 * Админ-ручки движения сделок (этап 7.3): прогон портала — «Посчитать»
 * или внеочередной счёт (джоба в очереди event-sales), его состояние и
 * проверка записи в ленту на одной сделке. Только apps/admin через
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
import {
    AiAnalyticsDealMovementProbeDto,
    AiAnalyticsDealMovementProbeQueryDto,
    AiAnalyticsDealMovementProbeRunResultDto,
    AiAnalyticsDealMovementProbeStatusDto,
} from '../dto/ai-analytics-deal-movement-probe.dto';
import { AiAnalyticsDealMovementService } from '../services/ai-analytics-deal-movement.service';
import { AiAnalyticsDealMovementProbeService } from '../services/ai-analytics-deal-movement-probe.service';
import { DEAL_MOVEMENT_STATUSES } from '../../model/deal-movement/deal-movement.types';
import { DEAL_MOVEMENT_STATUS_TITLES } from '../../model/deal-movement/deal-movement.texts';

/** Статусы словами — для описания ручки (подписи — из одного места). */
const DEAL_MOVEMENT_STATUS_LIST = DEAL_MOVEMENT_STATUSES.map(status =>
    DEAL_MOVEMENT_STATUS_TITLES[status].toLowerCase(),
).join(', ');

/** Пути ручек движения сделок (один источник для контроллера и спек). */
export const AI_ANALYTICS_DEAL_MOVEMENT_ROUTES = {
    run: 'deal-movement',
    status: 'deal-movement-status',
    probe: 'deal-movement-probe',
} as const;

@ApiTags(AI_ANALYTICS_ADMIN_TAG)
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AI_ANALYTICS_ADMIN_ROLES)
@Controller(AI_ANALYTICS_ADMIN_PATH)
export class AiAnalyticsDealMovementAdminController {
    constructor(
        private readonly movement: AiAnalyticsDealMovementService,
        private readonly probes: AiAnalyticsDealMovementProbeService,
    ) {}

    @Post(AI_ANALYTICS_DEAL_MOVEMENT_ROUTES.run)
    @HttpCode(200)
    @ApiOperation({
        summary: 'Посчитать движение сделок портала',
        description:
            'Ставит прогон в очередь event-sales: статусы всех открытых ' +
            `сделок «ОП Основная» (${DEAL_MOVEMENT_STATUS_LIST}) по ` +
            'стадиям, звонкам и делам по сделке. dryRun: true — ' +
            'подсчёт без сохранения и без записи, итог (и сколько записей ' +
            'ушло бы в ленту) в состоянии прогона; dryRun: false — ' +
            'внеочередной счёт: состояние и снимок дня сохраняются. В ленты ' +
            'сделок ручной счёт не пишет: записи делает только ночной счёт, ' +
            'расхождения ждут ночи (их число — в итоге прогона). Пока ' +
            'прогон портала того же режима ждёт или идёт, второй не ставится.',
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
            'открыто и оценено, счёт по статусам, смены за ночь, записи в ' +
            'ленту, предупреждения) и последний сохранённый снимок дня со ' +
            'сменами статуса словами.',
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

    @Post(AI_ANALYTICS_DEAL_MOVEMENT_ROUTES.probe)
    @HttpCode(200)
    @ApiOperation({
        summary: 'Проверить запись в ленту на одной сделке',
        description:
            'ПИШЕТ В ЖИВОЙ ПОРТАЛ: в открытую сделку «ОП Основная» уходят ' +
            'служебная запись журнала и комментарий «Проверка записи в ' +
            'ленту — служебная, можно удалить». До и после каждой записи ' +
            'читается «последняя активность» сделки; итог с выводами — в ' +
            'GET этой же ручки. Сделка не подходит — отказ без записей. ' +
            'Пока проверка портала ждёт или идёт, вторая не ставится.',
    })
    @ApiBody({
        type: AiAnalyticsDealMovementProbeDto,
        description: 'Домен портала и номер сделки.',
    })
    @ApiOkResponse({
        type: AiAnalyticsDealMovementProbeRunResultDto,
        description: 'Поставлена ли проверка, её джоба или причина отказа.',
    })
    async probe(
        @Body() dto: AiAnalyticsDealMovementProbeDto,
    ): Promise<AiAnalyticsDealMovementProbeRunResultDto> {
        return this.probes.probe({ domain: dto.domain, dealId: dto.dealId });
    }

    @Get(AI_ANALYTICS_DEAL_MOVEMENT_ROUTES.probe)
    @ApiOperation({
        summary: 'Итог проверки записи в ленту',
        description:
            'Идёт ли проверка и итог последней: «последняя активность» ' +
            'сделки до и после служебной записи и комментария и выводы ' +
            'словами — сдвигает ли каждая запись активность.',
    })
    @ApiOkResponse({
        type: AiAnalyticsDealMovementProbeStatusDto,
        description: 'Итог проверки записи в ленту.',
    })
    async probeStatus(
        @Query() query: AiAnalyticsDealMovementProbeQueryDto,
    ): Promise<AiAnalyticsDealMovementProbeStatusDto> {
        return this.probes.status(query.domain);
    }
}
