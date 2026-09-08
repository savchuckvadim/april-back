import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    AI_ANALYTICS_ADMIN_ROLES,
    AI_ANALYTICS_ROUTE_PREFIX,
    AI_ANALYTICS_SWAGGER_TAG,
} from './constants/ai-analytics.const';
import { RequesterAccessService } from './domain/access/requester-access.service';
import { AttentionUseCase } from './domain/use-cases/attention.use-case';
import { ByTypeUseCase } from './domain/use-cases/by-type.use-case';
import { OverviewLookupUseCase } from './domain/use-cases/overview-lookup.use-case';
import { SettingsSaveUseCase } from './domain/use-cases/settings-save.use-case';
import {
    AiAttentionRequestDto,
    AiAttentionResponseDto,
} from './dto/ai-attention.dto';
import { AiByTypeRequestDto, AiByTypeResponseDto } from './dto/ai-by-type.dto';
import { AiOverviewRequestDto } from './dto/ai-overview-request.dto';
import { AiOverviewResponseDto } from './dto/ai-overview.dto';
import {
    AiSettingsSaveRequestDto,
    AiSettingsSaveResponseDto,
} from './dto/ai-settings-save.dto';

/**
 * AI-аналитика отдела продаж, Фаза 1b (план 6.2–6.5, 9 «Фаза 1b» п. 3):
 * обзор менеджер × тип по паттерну очередь + WS + кэш, синхронные срезы
 * «Внимание» и by-type над тем же кэшем, сохранение уровней менеджеров.
 * Тот же тег и префикс, что у AiAnalyticsController (Фаза 1a) — разнесены
 * по файлам ради правила «класс ≤ 300 строк».
 *
 * Права: периметр requester'а применяется к строкам обзора при отдаче;
 * менеджер без headOf получает 403 на overview/attention/by-type, пока не
 * включена ai_analytics_self_view_enabled (тогда видит только себя);
 * settings/save — только cup|op.
 */
@ApiTags(AI_ANALYTICS_SWAGGER_TAG)
@Controller(AI_ANALYTICS_ROUTE_PREFIX)
export class AiAnalyticsOverviewController {
    constructor(
        private readonly access: RequesterAccessService,
        private readonly overviewLookup: OverviewLookupUseCase,
        private readonly attentionUseCase: AttentionUseCase,
        private readonly byTypeUseCase: ByTypeUseCase,
        private readonly settingsSaveUseCase: SettingsSaveUseCase,
    ) {}

    @Post('overview')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Обзор менеджер × тип звонка за период',
        description:
            'Матрица менеджер × AI-тип: оценки качества по разборам (n ≥ 8, ' +
            'иначе value = null), разделы рубрики, чек-листы, KPI-факты ' +
            'самоотчёта, план CRM и план руководителя, финансовый хвост, рёбра ' +
            'воронки, сигналы «Внимания», итоги по типам и отделам, срез ' +
            'возражений. Период в TZ портала не длиннее 3 месяцев. Кэш по ' +
            'ключу requestKey (период + нормализованный ростер + confirmedOnly): ' +
            'попадание → ready; расчёт идёт → processing; промах → джоба ' +
            'SALES_AI_ANALYTICS_OVERVIEW (jobId = requestKey) → queued, по ' +
            'завершении WS ai-analytics:overview:done|error с requestKey — ' +
            'затем повторить POST. forceRefresh пересчитывает и перезаписывает ' +
            "кэш. Строки — только в периметре requester'а.",
    })
    @ApiBody({ type: AiOverviewRequestDto })
    @ApiOkResponse({ type: AiOverviewResponseDto })
    async getOverview(
        @Body() dto: AiOverviewRequestDto,
    ): Promise<AiOverviewResponseDto> {
        const access = await this.access.resolveViewer(
            dto.domain,
            dto.requesterUserId,
        );
        return this.overviewLookup.lookup(dto, access);
    }

    @Post('attention')
    @HttpCode(200)
    @ApiOperation({
        summary: '«Внимание» РОПу над обзором',
        description:
            'До 7 карточек (не больше 3 на менеджера) по правилам Фазы 1: ' +
            'risk — риск-звонки; no_data — n < 8 при звонках; discipline — ' +
            '< 50 % плана CRM при плане ≥ 10; next_step_drop — падение доли ' +
            '«шаг с датой» при n ≥ 20 в обоих окнах. Считается синхронно над ' +
            'кэшем обзора с теми же фильтрами и requestKey; если обзор ещё не ' +
            'посчитан — конверт queued/processing обзора (дождаться WS и ' +
            "повторить). Карточки — только по менеджерам периметра requester'а.",
    })
    @ApiBody({ type: AiAttentionRequestDto })
    @ApiOkResponse({ type: AiAttentionResponseDto })
    async getAttention(
        @Body() dto: AiAttentionRequestDto,
    ): Promise<AiAttentionResponseDto> {
        const access = await this.access.resolveViewer(
            dto.domain,
            dto.requesterUserId,
        );
        return this.attentionUseCase.execute(dto, access);
    }

    @Post('by-type')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Срез обзора по типу звонка, всем типам или возражениям',
        description:
            'callType — подвкладка AI-типа, all (все типы вместе: строки на ' +
            'каждую пару менеджер × тип, итоги по типам в totalsByType) либо ' +
            'objections (сквозной срез возражений). layout=wide (по ' +
            'умолчанию) — строка на менеджера (при all — на пару менеджер × ' +
            'тип): ячейка типа, главный KPI-факт, финансы; layout=long — ' +
            'строка на «сотрудник | показатель | оценка | объяснение» по ' +
            'оценке типа, разделам, чек-листам, KPI-фактам (для objections — ' +
            'по категориям); каждая длинная строка несёт callType. Синхронно ' +
            'над кэшем обзора: если обзор не посчитан — конверт ' +
            "queued/processing обзора. Строки — в периметре requester'а.",
    })
    @ApiBody({
        type: AiByTypeRequestDto,
        description:
            'Фильтры обзора (период, менеджеры, confirmedOnly) плюс callType ' +
            'среза и необязательная раскладка layout.',
    })
    @ApiOkResponse({
        type: AiByTypeResponseDto,
        description:
            'Конверт: при ready — срез by-type в data; при queued/processing ' +
            'обзор ещё считается — дождаться WS и повторить POST.',
    })
    async getByType(
        @Body() dto: AiByTypeRequestDto,
    ): Promise<AiByTypeResponseDto> {
        const access = await this.access.resolveViewer(
            dto.domain,
            dto.requesterUserId,
        );
        return this.byTypeUseCase.execute(dto, access);
    }

    @Post('settings/save')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сохранение настроек витрины (девять блоков и уровни)',
        description:
            'Только руководители cup|op. Блоки необязательны: передан — ' +
            'перезаписывается, не передан — остаётся прежним. Уровни ' +
            '(junior/middle/senior, since — начало стажа не позже сегодня в TZ ' +
            "портала; каждый managerId — из периметра requester'а; пустой " +
            'список сбрасывает уровни к дефолту по стажу), цели по уровням, ' +
            'отсутствия, параметры менеджеров, определения событий, журнал ' +
            'событий портала, гиперпараметры модели, потолки оценивания, ' +
            'гипотеза качества и дата подтверждения ростера. Значения вне ' +
            'диапазонов реестра — 400, чужой менеджер — 403. Запись идёт в ' +
            'ключи настроек портала [kpiSales], сбрасываются кэши ' +
            'overview/attention/model/plan домена, каждое сохранение пишет ' +
            'снапшот ai-analytics-settings-audit. Правка поля с breaksSeries ' +
            'двигает comparableFrom вперёд (список кодов — в ответе).',
    })
    @ApiBody({ type: AiSettingsSaveRequestDto })
    @ApiOkResponse({ type: AiSettingsSaveResponseDto })
    async saveSettings(
        @Body() dto: AiSettingsSaveRequestDto,
    ): Promise<AiSettingsSaveResponseDto> {
        const access = await this.access.resolve(
            dto.domain,
            dto.requesterUserId,
        );
        this.access.assertLeader(access, AI_ANALYTICS_ADMIN_ROLES);
        const data = await this.settingsSaveUseCase.execute(dto, access);
        return {
            status: 'ready',
            requestKey: `${dto.domain}:settings-save:${data.id}`,
            data,
        };
    }
}
