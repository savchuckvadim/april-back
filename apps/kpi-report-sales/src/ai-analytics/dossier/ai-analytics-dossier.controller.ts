import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PortalSessionProtected } from '@lib/auth';
import {
    AI_ANALYTICS_ROUTE_PREFIX,
    AI_ANALYTICS_SWAGGER_TAG,
} from '../constants/ai-analytics.const';
import { AI_DOSSIER_ROUTE } from '../constants/ai-dossier.const';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { DossierUseCase } from '../domain/use-cases/dossier.use-case';
import {
    AiDossierRequestDto,
    AiDossierResponseDto,
} from '../dto/ai-dossier.dto';

/**
 * Досье менеджера (план Фазы 3, поток П4): всё, что витрина знает о
 * человеке за окно, одной ручкой — очередь + WS + кэш
 * (ai/rules/heavy-endpoint-queue.md). Тот же тег и префикс, что у
 * остальных ручек ai-analytics; отдельный файл — ради правила «класс
 * ≤ 300 строк».
 *
 * Контроллер не считает ничего: он разрешает периметр и отдаёт конверт
 * use-case'а (ready из кэша либо queued с jobId).
 *
 * Права (решение владельца В1 от 22.09.2026): досье видят руководители;
 * менеджер — только своё и только при включённой портальной настройке
 * `ai_analytics_self_view_enabled` (иначе 403), как у остальных читающих
 * ручек витрины — периметр берётся через `resolveViewer`. Чужой менеджер
 * в запросе руководителя — тоже 403 (`assertVisible` в use-case'е).
 */
@ApiTags(AI_ANALYTICS_SWAGGER_TAG)
@Controller(AI_ANALYTICS_ROUTE_PREFIX)
export class AiAnalyticsDossierController {
    constructor(
        private readonly access: RequesterAccessService,
        private readonly dossier: DossierUseCase,
    ) {}

    @PortalSessionProtected()
    @Post(AI_DOSSIER_ROUTE)
    @HttpCode(200)
    @ApiOperation({
        summary: 'Досье менеджера за окно (очередь + WS)',
        description:
            'Одной ручкой — всё, что витрина знает о менеджере за окно ' +
            '(по умолчанию 3 месяца): паспорт, ряды недель и месяцев, ' +
            'тренды, план-факт, год назад, стиль, возражения, свод ' +
            'обратной связи, метки руководителя и готовность витрины. ' +
            'Собирается только из снапшотов ночного конвейера и записей ' +
            'ais — в Bitrix ручка не ходит. Любой раздел, которого нет ' +
            'или который не собрался, приходит null, а причина — в ' +
            'reasons[]: досье при этом отдаётся целиком. Ключ результата ' +
            '— sales-ai-analytics:v1:{domain}:dossier:{managerId}:' +
            '{from}_{to}: попадание в кэш → ready; расчёт идёт → ' +
            'processing; промах → джоба SALES_AI_ANALYTICS_DOSSIER ' +
            '(jobId = requestKey) → queued, по завершении WS ' +
            'ai-analytics:dossier:done|error с requestKey — затем ' +
            'повторить POST. Кэш: окно с текущим месяцем — 10 минут, ' +
            'окно из закрытых месяцев — 30 дней; forceRefresh ' +
            'пересобирает, сброс — POST cache/reset.',
    })
    @ApiBody({ type: AiDossierRequestDto })
    @ApiOkResponse({
        type: AiDossierResponseDto,
        description:
            'Конверт: при ready — досье в data; при queued/processing — ' +
            'дождаться WS и повторить POST; при error — текст в message.',
    })
    async getDossier(
        @Body() dto: AiDossierRequestDto,
    ): Promise<AiDossierResponseDto> {
        const access = await this.access.resolveViewer(
            dto.domain,
            dto.requesterUserId,
        );

        // Конверт use-case'а и есть ответ ручки (как у резюме и обзора):
        // ready несёт data, queued/processing — jobId, error — message.
        return this.dossier.lookup(dto, access);
    }
}
