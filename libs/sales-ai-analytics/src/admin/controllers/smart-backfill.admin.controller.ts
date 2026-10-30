/**
 * Админ-ручки дописывания полей карточек разборов из сохранённых записей
 * без вызова модели: запуск (джоба `CALL_REPORT_SMART_BACKFILL` в очереди
 * `CALL_REPORT`, воркер — `apps/event-sales`) и статус прогона с числом
 * карточек, ждущих записи полей. Таймлайн и записи ais не меняются.
 */
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
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
    AiAnalyticsSmartBackfillRunDto,
    AiAnalyticsSmartBackfillRunResultDto,
    AiAnalyticsSmartBackfillStatusDto,
    AiAnalyticsSmartBackfillStatusQueryDto,
} from '../dto/ai-analytics-smart-backfill.dto';
import { AiAnalyticsSmartBackfillService } from '../services/ai-analytics-smart-backfill.service';

/** Пути ручек дописывания (один источник для контроллера, спек и путеводителя). */
export const AI_ANALYTICS_SMART_BACKFILL_ROUTES = {
    run: 'smart-backfill',
    status: 'smart-backfill-status',
} as const;

@ApiTags(AI_ANALYTICS_ADMIN_TAG)
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AI_ANALYTICS_ADMIN_ROLES)
@Controller(AI_ANALYTICS_ADMIN_PATH)
export class AiAnalyticsSmartBackfillAdminController {
    constructor(private readonly backfill: AiAnalyticsSmartBackfillService) {}

    @ApiOperation({
        summary: 'Дописать поля карточек разборов из сохранённых записей',
        description:
            'Ставит джобу CALL_REPORT_SMART_BACKFILL (очередь CALL_REPORT, ' +
            'воркер apps/event-sales). Модель не вызывается: разбор берётся ' +
            'из записи ais и раскладывается по полям существующего элемента ' +
            'смарта так же, как при приёме; новые элементы не создаются. ' +
            'Режим period — все карточки периода (по дате записи разбора), ' +
            'pending — только те, у которых запись полей не удалась (их же ' +
            'подбирает ночной крон). Период не задан — последние 30 дней. ' +
            'dryRun — только подсчёт. Квота на часть и бюджет 40 минут: ' +
            'остаток джоба дорабатывает продолжениями сама. Без очереди в ' +
            'сборке — dispatched: false с причиной.',
    })
    @ApiBody({ type: AiAnalyticsSmartBackfillRunDto })
    @ApiOkResponse({
        description: 'Джоба поставлена либо отказ с причиной.',
        type: AiAnalyticsSmartBackfillRunResultDto,
    })
    @Post(AI_ANALYTICS_SMART_BACKFILL_ROUTES.run)
    async run(
        @Body() dto: AiAnalyticsSmartBackfillRunDto,
    ): Promise<AiAnalyticsSmartBackfillRunResultDto> {
        return this.backfill.run({
            domain: dto.domain,
            ...(dto.mode === undefined ? {} : { mode: dto.mode }),
            ...(dto.from === undefined ? {} : { from: dto.from }),
            ...(dto.to === undefined ? {} : { to: dto.to }),
            ...(dto.quota === undefined ? {} : { quota: dto.quota }),
            ...(dto.dryRun === undefined ? {} : { dryRun: dto.dryRun }),
        });
    }

    @ApiOperation({
        summary: 'Статус дописывания полей карточек и число ожидающих',
        description:
            'Запись статуса call-report-smart-backfill-run по домену: прогон ' +
            'запрошенного режима и периода (если заданы оба), самый свежий ' +
            'прогон домена и число карточек с элементом, у которых поля ' +
            'разбора ещё не записаны (окно крона).',
    })
    @ApiOkResponse({
        description:
            'Статус прогона (null — не было), последний прогон, ожидающие.',
        type: AiAnalyticsSmartBackfillStatusDto,
    })
    @Get(AI_ANALYTICS_SMART_BACKFILL_ROUTES.status)
    async status(
        @Query() query: AiAnalyticsSmartBackfillStatusQueryDto,
    ): Promise<AiAnalyticsSmartBackfillStatusDto> {
        const key =
            query.from !== undefined && query.to !== undefined
                ? {
                      mode: query.mode ?? 'period',
                      from: query.from,
                      to: query.to,
                  }
                : undefined;
        return this.backfill.status(query.domain, key);
    }
}
