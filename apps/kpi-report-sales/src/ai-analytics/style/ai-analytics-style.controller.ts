import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PortalSessionProtected } from '@lib/auth';
import {
    AI_ANALYTICS_ROUTE_PREFIX,
    AI_ANALYTICS_SWAGGER_TAG,
} from '../constants/ai-analytics.const';
import { AI_STYLE_ROUTE } from '../constants/ai-style.const';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import {
    AiStyleCardDto,
    AiStyleProfileRequestDto,
} from '../dto/ai-style-card.dto';
import { StyleProfileUseCase } from './style-profile.use-case';

/**
 * Карточка стиля менеджера (документ
 * `ai/tasks/ai-analytics-manager-style.md`, поток S2/S4).
 *
 * Стиль — это КАК человек работает: у каждой оси два законных полюса,
 * рейтинга по осям нет, в нормы, цели и премии стиль не входит.
 *
 * Права: руководитель — по своему периметру; сам сотрудник — по себе
 * (свою подпись субъект видит первым, §1.3), при выключенной
 * `ai_analytics_self_view_enabled` менеджер получает 403 как на прочих
 * читающих ручках. Сотрудник, отказавшийся от профилирования
 * (`ai_analytics_style_opt_out`), профиля не имеет — карточка приходит со
 * статусом `opt_out` и текстом причины.
 */
@ApiTags(AI_ANALYTICS_SWAGGER_TAG)
@Controller(AI_ANALYTICS_ROUTE_PREFIX)
export class AiAnalyticsStyleController {
    constructor(
        private readonly access: RequesterAccessService,
        private readonly styleProfile: StyleProfileUseCase,
    ) {}

    @PortalSessionProtected()
    @Post(AI_STYLE_ROUTE)
    @HttpCode(200)
    @ApiOperation({
        summary: 'Карточка стиля менеджера за месячное окно',
        description:
            'Профиль стиля из снапшота ai-analytics-style: до трёх ' +
            'подписей-фактов с опорой в числах, оси с отклонением от нормы ' +
            'коллег и интервалом 80 %, форма воронки как контекст, блок «Как ' +
            'считаем». Ничего не считает на лету — отдаёт результат ночного ' +
            'шага конвейера. monthKey не передан — последний рассчитанный ' +
            'профиль. Меньше style_min_calls разборов или доверие none — ' +
            'status few_data с текстом «данных для стиля пока мало». ' +
            'Сотрудник из ai_analytics_style_opt_out — status opt_out без ' +
            'подписей и осей. Подпись, оспоренная самим сотрудником, ' +
            'остаётся в карточке с пометкой, но в notable не попадает. ' +
            'Менеджер вне периметра пользователя — 403.',
    })
    @ApiBody({ type: AiStyleProfileRequestDto })
    @ApiOkResponse({
        type: AiStyleCardDto,
        description:
            'Карточка стиля: ready — профиль есть; few_data — данных пока ' +
            'мало; opt_out — профиль отключён по запросу сотрудника.',
    })
    async getStyleProfile(
        @Body() dto: AiStyleProfileRequestDto,
    ): Promise<AiStyleCardDto> {
        const access = await this.access.resolveViewer(
            dto.domain,
            dto.requesterUserId,
        );
        return this.styleProfile.execute(dto, access);
    }
}
