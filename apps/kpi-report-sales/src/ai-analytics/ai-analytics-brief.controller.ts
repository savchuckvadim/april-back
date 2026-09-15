import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    AI_ANALYTICS_ROUTE_PREFIX,
    AI_ANALYTICS_SWAGGER_TAG,
} from './constants/ai-analytics.const';
import { RequesterAccessService } from './domain/access/requester-access.service';
import { BriefUseCase } from './domain/use-cases/brief.use-case';
import { AiBriefRequestDto, AiBriefResponseDto } from './dto/ai-brief.dto';

/**
 * AI-резюме отдела продаж (план Фазы 2, поток 18): короткая сводка
 * периода по пакету фактов витрины — очередь + WS + кэш
 * (ai/rules/heavy-endpoint-queue.md). Тот же тег и префикс, что у
 * остальных ручек ai-analytics; отдельный файл — ради правила «класс
 * ≤ 300 строк».
 *
 * Права: ручка читающая, периметр берётся через resolveViewer —
 * руководители видят свой периметр, менеджер без headOf получает 403,
 * пока не включена ai_analytics_self_view_enabled. Явный список
 * менеджеров проверяется на видимость: чужой — 403.
 */
@ApiTags(AI_ANALYTICS_SWAGGER_TAG)
@Controller(AI_ANALYTICS_ROUTE_PREFIX)
export class AiAnalyticsBriefController {
    constructor(
        private readonly access: RequesterAccessService,
        private readonly brief: BriefUseCase,
    ) {}

    @Post('brief')
    @HttpCode(200)
    @ApiOperation({
        summary: 'AI-резюме периода (очередь + WS)',
        description:
            'Короткое резюме периода по пакету фактов: алерты пульса, ' +
            'карточки «Внимания», разрывы воронки к норме, продажи против ' +
            'плана, ожидание из пайплайна, дисциплина «шаг с датой», ' +
            'звонки и эфирное время, прогноз месяца и качество данных. ' +
            'Пакет собирается только из кэша витрины и снапшотов ночного ' +
            'конвейера (в Bitrix и транскрипции ручка не ходит), режется ' +
            'до 10 фактов и 4 КБ; каждое число буллета обязано быть в ' +
            'пакете, иначе буллет отбрасывается. Ключ результата — ' +
            'sales-ai-analytics:v1:{domain}:brief:{packHash}: попадание в ' +
            'кэш → ready; расчёт идёт → processing; промах → джоба ' +
            'SALES_AI_ANALYTICS_BRIEF (jobId = requestKey) → queued, по ' +
            'завершении WS ai-analytics:brief:done|error с requestKey — ' +
            'затем повторить POST. Кэш 6 ч, forceRefresh пересобирает. ' +
            'Без ключа VibeCode, при исчерпанной дневной квоте ' +
            '(brief_quota_per_day) или провале факт-чека приходит ' +
            'шаблонное резюме с подписью причины (source = template).',
    })
    @ApiBody({ type: AiBriefRequestDto })
    @ApiOkResponse({
        type: AiBriefResponseDto,
        description:
            'Конверт: при ready — резюме в data; при queued/processing — ' +
            'дождаться WS и повторить POST; при error — текст в message.',
    })
    async getBrief(
        @Body() dto: AiBriefRequestDto,
    ): Promise<AiBriefResponseDto> {
        const access = await this.access.resolveViewer(
            dto.domain,
            dto.requesterUserId,
        );
        // Конверт use-case'а и есть ответ ручки (как у обзора): ready
        // несёт data, queued/processing — jobId, error — message.
        return this.brief.lookup(dto, access);
    }
}
