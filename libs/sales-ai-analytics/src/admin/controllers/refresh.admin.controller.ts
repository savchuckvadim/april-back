/**
 * «Обновить всё по порядку» из админки (просьба владельца 08.11.2026):
 * одна кнопка вместо шагов 4, 7, 8, 9 панели запуска и карточки PDF —
 * переразбор месяца, пересчёт, кэш, прогноз, PDF собственнику — по
 * очереди, со сводкой по всем порталам. Только apps/admin.
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
    AiRefreshPortalStateDto,
    AiRefreshPortalsDto,
    AiRefreshStartAllDto,
    AiRefreshStartAllResultDto,
    AiRefreshStartDto,
    AiRefreshStartResultDto,
    AiRefreshStateQueryDto,
} from '../dto/ai-refresh.dto';
import { AiAnalyticsRefreshService } from '../refresh/ai-analytics-refresh.service';

export const AI_REFRESH_ROUTES = {
    start: 'refresh',
    state: 'refresh',
    portals: 'refresh/portals',
    startAll: 'refresh/all',
} as const;

const STEPS_DESCRIPTION =
    'Шаги по очереди, каждый — когда закончился предыдущий: переразбор ' +
    'звонков месяца (если заказан: подсчёт без модели, затем запуск, не ' +
    'больше 1500 звонков) → пересчёт месяца заново (витрина, история ' +
    'стадий, журнал прогноза, проверка точности) → сброс кэша витрины → ' +
    'прогноз (проверка пройдена — показ включается, принудительно никогда) ' +
    '→ PDF отчёта собственнику за месяц (в Redis на сутки). Состояние — в ' +
    'Redis неделю, тик раз в минуту в очереди AI_ANALYTICS_ADMIN; ' +
    'страницу можно закрыть. Идущий сценарий портала не дублируется. ' +
    'Клиенту ничего не отправляется.';

@ApiTags(AI_ANALYTICS_ADMIN_TAG)
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AI_ANALYTICS_ADMIN_ROLES)
@Controller(AI_ANALYTICS_ADMIN_PATH)
export class AiAnalyticsRefreshAdminController {
    constructor(private readonly refresh: AiAnalyticsRefreshService) {}

    @ApiOperation({
        summary: 'Обновить всё по порядку на портале',
        description: STEPS_DESCRIPTION,
    })
    @ApiBody({ type: AiRefreshStartDto })
    @ApiOkResponse({
        description: 'Запущен ли сценарий и его состояние.',
        type: AiRefreshStartResultDto,
    })
    @ApiBadRequestResponse({
        description: 'Месяц не в виде ГГГГ-ММ или ещё не закончился.',
    })
    @Post(AI_REFRESH_ROUTES.start)
    @HttpCode(200)
    start(@Body() dto: AiRefreshStartDto): Promise<AiRefreshStartResultDto> {
        return this.refresh.start({
            domain: dto.domain,
            withReanalysis: dto.withReanalysis,
            ...(dto.monthKey ? { monthKey: dto.monthKey } : {}),
        });
    }

    @ApiOperation({
        summary: 'Состояние сценария «обновить всё» портала',
        description:
            'Последний сценарий портала со всеми шагами; не запускали или ' +
            'прошла неделя — scenario = null. Только чтение.',
    })
    @ApiOkResponse({
        description: 'Портал и его сценарий.',
        type: AiRefreshPortalStateDto,
    })
    @Get(AI_REFRESH_ROUTES.state)
    async state(
        @Query() query: AiRefreshStateQueryDto,
    ): Promise<AiRefreshPortalStateDto> {
        return {
            domain: query.domain,
            scenario: await this.refresh.state(query.domain),
        };
    }

    @ApiOperation({
        summary: 'Сценарии «обновить всё» по всем порталам',
        description:
            'Порталы с включённой AI-аналитикой (ai_analytics_enabled ' +
            'kpiSales) и их последние сценарии — одна страница вместо ' +
            'обхода порталов. Только чтение.',
    })
    @ApiOkResponse({
        description: 'Порталы и сценарии.',
        type: AiRefreshPortalsDto,
    })
    @Get(AI_REFRESH_ROUTES.portals)
    async portals(): Promise<AiRefreshPortalsDto> {
        return { portals: await this.refresh.portals() };
    }

    @ApiOperation({
        summary: 'Обновить всё по порядку на всех порталах',
        description: `${STEPS_DESCRIPTION} Запускается на каждом портале с включённой AI-аналитикой; где сценарий уже идёт — не трогается.`,
    })
    @ApiBody({ type: AiRefreshStartAllDto })
    @ApiOkResponse({
        description: 'Итог по каждому порталу.',
        type: AiRefreshStartAllResultDto,
    })
    @ApiBadRequestResponse({
        description: 'Месяц не в виде ГГГГ-ММ или ещё не закончился.',
    })
    @Post(AI_REFRESH_ROUTES.startAll)
    @HttpCode(200)
    async startAll(
        @Body() dto: AiRefreshStartAllDto,
    ): Promise<AiRefreshStartAllResultDto> {
        return {
            results: await this.refresh.startAll({
                withReanalysis: dto.withReanalysis,
                ...(dto.monthKey ? { monthKey: dto.monthKey } : {}),
            }),
        };
    }
}
