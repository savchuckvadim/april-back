import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    AI_ANALYTICS_ROUTE_PREFIX,
    AI_ANALYTICS_SWAGGER_TAG,
} from '../constants/ai-analytics.const';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { AiAboutRequestDto, AiAboutResponseDto } from '../dto/ai-about.dto';
import { AI_ABOUT_ROUTE } from './ai-analytics-about.const';
import { AiAnalyticsAboutUseCase } from './ai-analytics-about.use-case';

/**
 * Блок «Как считаем» (план Фазы 2 §6, долг 26 волны C): для ручки витрины
 * отдаёт, что и откуда она считает, какие параметры реестра использует с
 * действующими на портале значениями и по какой модели портала —
 * готовность с причинами, κ / φ / λ с источником, режим связи качества с
 * исходом, трактовка рёбер, санити-панель.
 *
 * Права — как у читающих ручек витрины: руководитель по периметру,
 * менеджер — только при ai_analytics_self_view_enabled, иначе 403.
 */
@ApiTags(AI_ANALYTICS_SWAGGER_TAG)
@Controller(AI_ANALYTICS_ROUTE_PREFIX)
export class AiAnalyticsAboutController {
    constructor(
        private readonly access: RequesterAccessService,
        private readonly about: AiAnalyticsAboutUseCase,
    ) {}

    @Post(AI_ABOUT_ROUTE)
    @HttpCode(200)
    @ApiOperation({
        summary: 'Блок «Как считаем» для ручки витрины',
        description:
            'Собирается из реестра параметров и последнего снапшота ' +
            'месячной модели портала, а не пишется руками: тексты ручки, ' +
            'параметры с действующими значениями и слоем (портал, полоса ' +
            'стажа, менеджер, дефолт), версия набора параметров, ' +
            'готовность с причинами, κ / φ / λ с источником ' +
            '(estimated | configured | hybrid), betaSource, трактовка ' +
            'рёбер, comparableFrom и санити-панель. Модели портала ещё нет — ' +
            'model = null с причиной в modelReason, параметры остаются.',
    })
    @ApiBody({ type: AiAboutRequestDto })
    @ApiOkResponse({
        type: AiAboutResponseDto,
        description: 'Блок «Как считаем» ручки; status всегда ready.',
    })
    async getAbout(
        @Body() dto: AiAboutRequestDto,
    ): Promise<AiAboutResponseDto> {
        await this.access.resolveViewer(dto.domain, dto.requesterUserId);
        return this.about.execute(dto);
    }
}
