import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PortalSessionProtected } from '@lib/auth';
import {
    AI_ANALYTICS_CACHE_PREFIX,
    AI_ANALYTICS_ROUTE_PREFIX,
    AI_ANALYTICS_SWAGGER_TAG,
} from './constants/ai-analytics.const';
import {
    AI_ROP_MARK_STEP_CODE,
    AI_ROP_MARK_WEEKLY_LIMIT,
} from './constants/ai-rop-mark.const';
import { RequesterAccessService } from './domain/access/requester-access.service';
import { RopMarkUseCase } from './domain/use-cases/rop-mark.use-case';
import {
    AiRopMarkListRequestDto,
    AiRopMarkPickRequestDto,
    AiRopMarkSaveRequestDto,
} from './dto/ai-rop-mark-request.dto';
import {
    AiRopMarkSaveResponseDto,
    AiRopMarkWeekResponseDto,
} from './dto/ai-rop-mark.dto';

/** Пути ручек слепой проверки внутри AI_ANALYTICS_ROUTE_PREFIX. */
export const AI_ROP_MARK_ROUTES = {
    pick: 'rop-mark/pick',
    list: 'rop-mark/list',
    save: 'rop-mark/save',
} as const;

/**
 * Ключ результата в конверте (план 6.2): ручки синхронные и результат не
 * кэшируется, но конверт витрины требует ключ — для подбора это неделя,
 * для метки — звонок, по которому она поставлена.
 */
export function buildRopMarkKey(domain: string, key: string): string {
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${AI_ROP_MARK_STEP_CODE}:${key}`;
}

/**
 * Слепая проверка руководителя «три звонка недели» (план Фазы 2, поток
 * 15 — сценарий, поток 19 — ручки; постановка §12 и §4.11 главного
 * плана). Тот же тег и префикс, что у остальных ручек ai-analytics;
 * отдельный файл — ради правила «класс ≤ 300 строк».
 *
 * Права: периметр берётся через resolveViewer (менеджер без headOf при
 * выключенной ai_analytics_self_view_enabled получает 403 ещё здесь), а
 * сам сценарий пускает только руководителей (cup/op/group) — менеджер с
 * включённой настройкой тоже получает 403: метка руководителя не для
 * менеджеров. Звонок вне периметра — 403, вне подбора недели — 400.
 *
 * Ручки синхронные: подбор — лёгкая выборка разборов недели, метка —
 * одна запись в ais; очередь и WS не нужны.
 */
@ApiTags(AI_ANALYTICS_SWAGGER_TAG)
@Controller(AI_ANALYTICS_ROUTE_PREFIX)
export class AiAnalyticsRopMarkController {
    constructor(
        private readonly access: RequesterAccessService,
        private readonly ropMark: RopMarkUseCase,
    ) {}

    @Post(AI_ROP_MARK_ROUTES.pick)
    @HttpCode(200)
    @ApiOperation({
        summary: 'Подбор трёх звонков недели для слепой проверки',
        description:
            `Система сама подбирает до ${AI_ROP_MARK_WEEKLY_LIMIT} звонков ` +
            'закончившейся или указанной недели: с неуверенным типом, с ' +
            'лучшим баллом (проверка на подыгрывание метрике) и случайный — ' +
            'не более одного звонка на менеджера. Подбор детерминирован ' +
            'зерном домена и ключа недели: повтор запроса и ночной шаг ' +
            'понедельника дают один набор; forceRefresh пересобирает подбор ' +
            'по текущим звонкам недели. Слепой режим: колонки оценки AI ' +
            '(aiCallType, aiScore) отдаются только по звонкам с уже ' +
            'сохранённой меткой. Только руководителям (cup/op/group), ' +
            'менеджеру — 403; звонки чужих менеджеров вырезаются периметром. ' +
            'Суперпользователь вендора подбор не сохраняет: forceRefresh — ' +
            '403, а если подбора недели ещё нет, он получает тот же подбор ' +
            'как предпросмотр без записи.',
    })
    @ApiBody({ type: AiRopMarkPickRequestDto })
    @ApiOkResponse({
        type: AiRopMarkWeekResponseDto,
        description:
            'Конверт со status = ready: в data — неделя, подобранные звонки ' +
            'и уже поставленные метки.',
    })
    async pick(
        @Body() dto: AiRopMarkPickRequestDto,
    ): Promise<AiRopMarkWeekResponseDto> {
        const access = await this.access.resolveViewer(
            dto.domain,
            dto.requesterUserId,
        );
        const data = await this.ropMark.pick(dto, access);

        return {
            status: 'ready',
            requestKey: buildRopMarkKey(dto.domain, data.weekKey),
            data,
        };
    }

    @Post(AI_ROP_MARK_ROUTES.list)
    @HttpCode(200)
    @ApiOperation({
        summary: 'Подбор недели и метки руководителя по нему',
        description:
            'Сохранённый подбор недели вместе с метками; подбора ещё нет — ' +
            'пустой список calls (новый подбор эта ручка не делает, для ' +
            'этого есть rop-mark/pick). Слепой режим и периметр — как у ' +
            'подбора. Только руководителям, менеджеру — 403.',
    })
    @ApiBody({ type: AiRopMarkListRequestDto })
    @ApiOkResponse({
        type: AiRopMarkWeekResponseDto,
        description:
            'Конверт со status = ready: в data — неделя, звонки подбора и ' +
            'метки по ним (или пустой список, если подбора не было).',
    })
    async list(
        @Body() dto: AiRopMarkListRequestDto,
    ): Promise<AiRopMarkWeekResponseDto> {
        const access = await this.access.resolveViewer(
            dto.domain,
            dto.requesterUserId,
        );
        const data = await this.ropMark.list(dto, access);

        return {
            status: 'ready',
            requestKey: buildRopMarkKey(dto.domain, data.weekKey),
            data,
        };
    }

    @PortalSessionProtected()
    @Post(AI_ROP_MARK_ROUTES.save)
    @HttpCode(200)
    @ApiOperation({
        summary: 'Слепая метка руководителя по звонку подбора',
        description:
            'Согласие с оценкой AI, своя оценка 1–10, разделы рубрики, ' +
            '«почему так» и «как лучше» по одному из звонков подбора недели. ' +
            'Звонок вне подбора или подбор, которого ещё нет, — 400 с ' +
            'текстом причины; менеджер звонка вне периметра — 403. ' +
            'Повторная метка заменяет прежнюю (та уходит в superseded) и ' +
            'слепой уже не считается: к этому моменту оценка AI по звонку ' +
            'раскрыта. Только руководителям, менеджеру и суперпользователю ' +
            'вендора — 403.',
    })
    @ApiBody({ type: AiRopMarkSaveRequestDto })
    @ApiOkResponse({
        type: AiRopMarkSaveResponseDto,
        description:
            'Конверт со status = ready: в data — id записи метки, признак ' +
            'замены прежней метки и признак слепой метки.',
    })
    async save(
        @Body() dto: AiRopMarkSaveRequestDto,
    ): Promise<AiRopMarkSaveResponseDto> {
        const access = await this.access.resolveViewer(
            dto.domain,
            dto.requesterUserId,
        );
        const data = await this.ropMark.save(dto, access);

        return {
            status: 'ready',
            requestKey: buildRopMarkKey(dto.domain, dto.transcriptionId),
            data,
        };
    }
}
