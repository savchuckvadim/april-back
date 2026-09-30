import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PortalSessionProtected } from '@lib/auth';
import {
    AI_ANALYTICS_ROUTE_PREFIX,
    AI_ANALYTICS_SWAGGER_TAG,
} from './constants/ai-analytics.const';
import { AI_FORECAST_ROUTE } from './constants/ai-forecast.const';
import { RequesterAccessService } from './domain/access/requester-access.service';
import { ForecastUseCase } from './domain/use-cases/forecast.use-case';
import {
    AiForecastRequestDto,
    AiForecastResponseDto,
} from './dto/ai-forecast.dto';

/**
 * Прогноз отдела на месяц (Фаза 4, план §4.8, §10 L4; поток B3). Тот же
 * тег и префикс, что у остальных ручек вкладки; отдельный файл — правило
 * «класс ≤ 300 строк».
 *
 * Ручка читающая и синхронная: два чтения снапшотов и режим готовности из
 * кэша settings/get, без своего кэша и очереди,
 * Битрикс не вызывается. Прогноз уровня отдела — только руководителям
 * (cup|op|group, как сводные строки обзора): менеджер получает 403 даже
 * при включённом просмотре «по себе».
 */
@ApiTags(AI_ANALYTICS_SWAGGER_TAG)
@Controller(AI_ANALYTICS_ROUTE_PREFIX)
export class AiAnalyticsForecastController {
    constructor(
        private readonly access: RequesterAccessService,
        private readonly forecast: ForecastUseCase,
    ) {}

    @PortalSessionProtected()
    @Post(AI_FORECAST_ROUTE)
    @HttpCode(200)
    @ApiOperation({
        summary: 'Прогноз продаж отдела на текущий месяц',
        description:
            'Вилка продаж отдела на месяц (низ, середина, верх; уровень ' +
            'forecast_interval_level) из ночного журнала ' +
            'ai-analytics-forecast-log и сводка проверки точности на ' +
            'истории из ai-analytics-forecast-backtest. Режим published — ' +
            'теневых месяцев не меньше forecast_shadow_min_months, ' +
            'проверка пройдена, ступень включена флагом портала ' +
            'forecast_stage_enabled и режим готовности портала (тот же, ' +
            'что в settings/get) не ниже «прогноза»: тогда в ответе вилка ' +
            'и рубли по среднему чеку, если журнал за месяц уже есть. ' +
            'Иначе режим shadow: вилки и рублей нет, коды причин — в ' +
            'reasons; сводка теневого режима отдаётся всегда. Синхронно, ' +
            'без своего кэша; только руководителям.',
    })
    @ApiBody({ type: AiForecastRequestDto })
    @ApiOkResponse({
        type: AiForecastResponseDto,
        description: 'Конверт со status = ready: в data — прогноз отдела.',
    })
    async getForecast(
        @Body() dto: AiForecastRequestDto,
    ): Promise<AiForecastResponseDto> {
        const access = await this.access.resolve(
            dto.domain,
            dto.requesterUserId,
        );
        this.access.assertLeader(access);
        const data = await this.forecast.execute(dto.domain);
        return {
            status: 'ready',
            requestKey: `${dto.domain}:${AI_FORECAST_ROUTE}:${data.monthKey}`,
            data,
        };
    }
}
