import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiAnalyticsCacheService } from './cache/ai-analytics-cache.service';
import {
    agendaTtlSeconds,
    buildAgendaKey,
    buildPulseKey,
    buildResetPattern,
    buildSettingsKey,
} from './cache/cache-key.util';
import {
    AI_ANALYTICS_ADMIN_ROLES,
    AI_ANALYTICS_PUSH_JOB_ID_PREFIX,
    AI_ANALYTICS_PULSE_TTL_SECONDS,
    AI_ANALYTICS_ROUTE_PREFIX,
    AI_ANALYTICS_SETTINGS_TTL_SECONDS,
    AI_ANALYTICS_SWAGGER_TAG,
} from './constants/ai-analytics.const';
import { RequesterAccessService } from './domain/access/requester-access.service';
import { applyAgendaPerimeter } from './domain/presenter/agenda.presenter';
import { applyPulsePerimeter } from './domain/presenter/pulse.presenter';
import { AgendaUseCase } from './domain/use-cases/agenda.use-case';
import { FeedbackUseCase } from './domain/use-cases/feedback.use-case';
import { PulseUseCase } from './domain/use-cases/pulse.use-case';
import { AiAnalyticsPushUseCase } from './domain/use-cases/push.use-case';
import { SettingsUseCase } from './domain/use-cases/settings.use-case';
import {
    AiAgendaDto,
    AiAgendaRequestDto,
    AiAgendaResponseDto,
} from './dto/ai-agenda.dto';
import {
    AiCacheResetRequestDto,
    AiCacheResetResponseDto,
} from './dto/ai-cache-reset.dto';
import {
    AiFeedbackListRequestDto,
    AiFeedbackListResponseDto,
} from './dto/ai-feedback-list.dto';
import {
    AiFeedbackRequestDto,
    AiFeedbackResponseDto,
} from './dto/ai-feedback.dto';
import {
    AiPulseDto,
    AiPulseRequestDto,
    AiPulseResponseDto,
} from './dto/ai-pulse.dto';
import { AiPushRequestDto, AiPushResponseDto } from './dto/ai-push.dto';
import {
    AiAnalyticsSettingsDto,
    AiSettingsGetRequestDto,
    AiSettingsResponseDto,
} from './dto/ai-settings.dto';

/**
 * AI-аналитика отдела продаж, Фаза 1a (план ai/tasks/ai-sales-analytics-plan.md,
 * 6.2–6.5): синхронные ручки с кэшем на домен и серверной проверкой прав по
 * структуре отделов (requesterUserId): руководитель видит периметр,
 * менеджер — только свои строки; сброс кэша — только cup|op; ручной
 * push (повестка/дайджест) — руководители.
 */
@ApiTags(AI_ANALYTICS_SWAGGER_TAG)
@Controller(AI_ANALYTICS_ROUTE_PREFIX)
export class AiAnalyticsController {
    constructor(
        private readonly access: RequesterAccessService,
        private readonly cache: AiAnalyticsCacheService,
        private readonly settingsUseCase: SettingsUseCase,
        private readonly pulseUseCase: PulseUseCase,
        private readonly agendaUseCase: AgendaUseCase,
        private readonly feedbackUseCase: FeedbackUseCase,
        private readonly pushUseCase: AiAnalyticsPushUseCase,
    ) {}

    @Post('settings/get')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Настройки и готовность AI-аналитики',
        description:
            'Флаги портала (ai_analytics_*), есть ли разборы за 30 дней ' +
            '(pipelineEnabled), режим готовности по объёму истории, типы звонков ' +
            'из карты алфавитов, дата сопоставимости версий, РОПы. Кэш 300 с.',
    })
    @ApiBody({ type: AiSettingsGetRequestDto })
    @ApiOkResponse({ type: AiSettingsResponseDto })
    async getSettings(
        @Body() dto: AiSettingsGetRequestDto,
    ): Promise<AiSettingsResponseDto> {
        await this.access.resolve(dto.domain, dto.requesterUserId);
        const requestKey = buildSettingsKey(dto.domain);
        const { value } = await this.cache.remember<AiAnalyticsSettingsDto>(
            requestKey,
            AI_ANALYTICS_SETTINGS_TTL_SECONDS,
            () => this.settingsUseCase.execute(dto.domain),
        );
        return { status: 'ready', requestKey, data: value };
    }

    @Post('pulse')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Пульс дисциплины «следующий шаг с датой»',
        description:
            'Окно 5 рабочих дней до вчерашнего рабочего дня (TZ портала): доля ' +
            'разобранных звонков с назначенным шагом и датой, XmR по дневным долям ' +
            '25 рабочих дней, строки менеджеров с n ≥ 20 и сигналы руководителю — ' +
            "в периметре requester'а. Кэш 1 ч.",
    })
    @ApiBody({ type: AiPulseRequestDto })
    @ApiOkResponse({ type: AiPulseResponseDto })
    async getPulse(
        @Body() dto: AiPulseRequestDto,
    ): Promise<AiPulseResponseDto> {
        const access = await this.access.resolve(
            dto.domain,
            dto.requesterUserId,
        );
        const endDate = await this.pulseUseCase.resolveEndDate(dto.domain);
        const requestKey = buildPulseKey(dto.domain, endDate);
        const { value } = await this.cache.remember<AiPulseDto>(
            requestKey,
            AI_ANALYTICS_PULSE_TTL_SECONDS,
            () => this.pulseUseCase.execute(dto.domain),
        );
        return {
            status: 'ready',
            requestKey,
            data: applyPulsePerimeter(value, access),
        };
    }

    @Post('agenda')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Повестка РОПа на неделю',
        description:
            '3 звонка текущей ISO-недели по приоритету риск-флаг → спорное ' +
            'возражение → слабый раздел, с цитатой и ссылкой на карточку разбора; ' +
            "несогласия недели. В периметре requester'а. Кэш до следующего понедельника.",
    })
    @ApiBody({ type: AiAgendaRequestDto })
    @ApiOkResponse({ type: AiAgendaResponseDto })
    async getAgenda(
        @Body() dto: AiAgendaRequestDto,
    ): Promise<AiAgendaResponseDto> {
        const access = await this.access.resolve(
            dto.domain,
            dto.requesterUserId,
        );
        const now = new Date();
        const { weekKey, timeZone } = await this.agendaUseCase.resolveWeek(
            dto.domain,
            now,
        );
        const requestKey = buildAgendaKey(dto.domain, weekKey);
        const { value } = await this.cache.remember<AiAgendaDto>(
            requestKey,
            agendaTtlSeconds(now, timeZone),
            () => this.agendaUseCase.execute(dto.domain, { now }),
        );
        return {
            status: 'ready',
            requestKey,
            data: applyAgendaPerimeter(value, access),
        };
    }

    @Post('feedback')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Обратная связь по витрине',
        description:
            'Пишет реакцию (view/useful/not_useful/disagree/alert_handled) в ais ' +
            'от имени requesterUserId. Менеджер без роли руководителя пишет только ' +
            'за себя; руководитель — за менеджера своего периметра.',
    })
    @ApiBody({ type: AiFeedbackRequestDto })
    @ApiOkResponse({ type: AiFeedbackResponseDto })
    async addFeedback(
        @Body() dto: AiFeedbackRequestDto,
    ): Promise<AiFeedbackResponseDto> {
        const access = await this.access.resolve(
            dto.domain,
            dto.requesterUserId,
        );
        const data = await this.feedbackUseCase.add(dto, access);
        return {
            status: 'ready',
            requestKey: `${dto.domain}:feedback:${dto.kind}:${dto.object}`,
            data,
        };
    }

    @Post('feedback/list')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Список обратной связи за период',
        description:
            'Записи ais типа ai-analytics-feedback по домену и периоду (даты в TZ ' +
            'портала), опционально по менеджеру, плюс доля несогласий. Список по ' +
            'всем менеджерам — только руководителям; менеджер видит только свои строки.',
    })
    @ApiBody({ type: AiFeedbackListRequestDto })
    @ApiOkResponse({ type: AiFeedbackListResponseDto })
    async listFeedback(
        @Body() dto: AiFeedbackListRequestDto,
    ): Promise<AiFeedbackListResponseDto> {
        const access = await this.access.resolve(
            dto.domain,
            dto.requesterUserId,
        );
        if (dto.managerId === undefined) this.access.assertLeader(access);
        const data = await this.feedbackUseCase.list(dto, access);
        return {
            status: 'ready',
            requestKey: `${dto.domain}:feedback-list:${dto.from}_${dto.to}_${dto.managerId ?? 'all'}`,
            data,
        };
    }

    @Post('cache/reset')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сброс кэша AI-аналитики по домену',
        description:
            'Удаляет ключи кэша модуля: scope=pulse|agenda|settings — соответствующий ' +
            'раздел, all (по умолчанию) — всё, включая периметры доступа. ' +
            'Только руководители уровня cup|op.',
    })
    @ApiBody({ type: AiCacheResetRequestDto })
    @ApiOkResponse({ type: AiCacheResetResponseDto })
    async resetCache(
        @Body() dto: AiCacheResetRequestDto,
    ): Promise<AiCacheResetResponseDto> {
        const access = await this.access.resolve(
            dto.domain,
            dto.requesterUserId,
        );
        this.access.assertLeader(access, AI_ANALYTICS_ADMIN_ROLES);
        const pattern = buildResetPattern(dto.domain, dto.scope ?? 'all');
        const deletedCount = await this.cache.resetByPattern(pattern);
        return { deletedCount, pattern };
    }

    @Post('push')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Ручной запуск push-рассылки (повестка / утренний разбор)',
        description:
            'Синхронно выполняет тот же код, что и крон (пн 08:30 МСК повестка ' +
            'РОПам, ежедневно 08:00 МСК дайджест менеджерам): kind=agenda|digest, ' +
            'date — день запуска в TZ портала (по умолчанию сегодня), recipients — ' +
            'кому отправить вместо получателей по настройкам (тест «отправить ' +
            'себе»; отметки доставки при этом не пишутся). Только руководители.',
    })
    @ApiBody({ type: AiPushRequestDto })
    @ApiOkResponse({ type: AiPushResponseDto })
    async push(@Body() dto: AiPushRequestDto): Promise<AiPushResponseDto> {
        const access = await this.access.resolve(
            dto.domain,
            dto.requesterUserId,
        );
        this.access.assertLeader(access);
        const data = await this.pushUseCase.execute({
            domain: dto.domain,
            kind: dto.kind,
            date: dto.date,
            recipients: dto.recipients,
        });
        return {
            status: 'ready',
            requestKey: `${AI_ANALYTICS_PUSH_JOB_ID_PREFIX}:${data.kind}:${dto.domain}:${data.date}`,
            data,
        };
    }
}
