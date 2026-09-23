/**
 * Админ-ручки конвейера AI-аналитики ОП (план Фазы 3, П5): ручной
 * пересчёт периода, догон истории и состояние ночных прогонов.
 *
 * Расчёт здесь НЕ живёт: ручки ставят джобы в общую очередь
 * (`QueueNames.SALES_KPI_REPORT`, решение владельца В2 от 22.09.2026), а
 * считает их воркер `apps/kpi-report-sales`. Состояние читается
 * собственным read-only стором библиотеки.
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
    AI_ANALYTICS_ETL_STATUS_DEFAULTS,
    AiAnalyticsEtlStatusQueryDto,
} from '../dto/ai-analytics-etl-status-query.dto';
import { AiAnalyticsEtlStatusResultDto } from '../dto/ai-analytics-etl-status.dto';
import {
    AiAnalyticsBackfillDto,
    AiAnalyticsRecomputeDto,
} from '../dto/ai-analytics-pipeline-admin.dto';
import {
    AiAnalyticsBackfillResultDto,
    AiAnalyticsRecomputeResultDto,
} from '../dto/ai-analytics-pipeline-result.dto';
import { AiAnalyticsEtlStatusService } from '../services/ai-analytics-etl-status.service';
import { AiAnalyticsPipelineAdminService } from '../services/ai-analytics-pipeline-admin.service';

@ApiTags(AI_ANALYTICS_ADMIN_TAG)
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AI_ANALYTICS_ADMIN_ROLES)
@Controller(AI_ANALYTICS_ADMIN_PATH)
export class AiAnalyticsPipelineAdminController {
    constructor(
        private readonly pipeline: AiAnalyticsPipelineAdminService,
        private readonly etlStatus: AiAnalyticsEtlStatusService,
    ) {}

    @ApiOperation({
        summary: 'Пересчитать период конвейера (ручная джоба)',
        description:
            'Ставит ОДНУ джобу снапшотов в общую очередь sales-kpi-report ' +
            'с forceRefresh = true: уже посчитанный период переписывается, ' +
            'прошлые версии становятся superseded. Сам расчёт идёт в ' +
            'воркере kpi-report-sales — ручка отвечает сразу, до прогона. ' +
            'jobId несёт метку момента, поэтому повторный вызов очередь не ' +
            'проглатывает (у ритмов jobId детерминирован по периоду, и Bull ' +
            'молча игнорирует повтор существующего id). Аудит данных Фазы 0 ' +
            'сюда не входит — для него POST admin/ai-analytics/audit.',
    })
    @ApiBody({ type: AiAnalyticsRecomputeDto })
    @ApiOkResponse({
        description: 'Поставленная джоба пересчёта: jobId, ключ и ритм.',
        type: AiAnalyticsRecomputeResultDto,
    })
    @Post('recompute')
    async recompute(
        @Body() dto: AiAnalyticsRecomputeDto,
    ): Promise<AiAnalyticsRecomputeResultDto> {
        return this.pipeline.recompute({
            domain: dto.domain,
            rhythm: dto.rhythm,
            monthKey: dto.monthKey,
            ...(dto.day ? { day: dto.day } : {}),
            ...(dto.weekKey ? { weekKey: dto.weekKey } : {}),
            ...(dto.steps ? { steps: dto.steps } : {}),
        });
    }

    @ApiOperation({
        summary: 'Догнать историю снапшотов за диапазон месяцев',
        description:
            'Ставит по джобе ритма backfill на каждый месяц диапазона ' +
            '(включительно) в очередь sales-kpi-report. Ответ — оценка ' +
            'объёма: список месяцев и поставленные джобы. jobId ' +
            'детерминирован месяцем, поэтому повтор запроса дублей не ' +
            'создаёт, а уже посчитанные периоды раннер пропускает сам ' +
            '(forceRefresh здесь не ставится — для пересчёта есть ' +
            'отдельная ручка recompute). Диапазон шире 24 месяцев ' +
            'отклоняется с reason = backfill-range-too-wide: столько джоб ' +
            'за раз заливает общую очередь.',
    })
    @ApiBody({ type: AiAnalyticsBackfillDto })
    @ApiOkResponse({
        description:
            'Месяцы диапазона, поставленные джобы и причина отказа (null ' +
            'при успехе).',
        type: AiAnalyticsBackfillResultDto,
    })
    @Post('backfill')
    async backfill(
        @Body() dto: AiAnalyticsBackfillDto,
    ): Promise<AiAnalyticsBackfillResultDto> {
        return this.pipeline.backfill({
            domain: dto.domain,
            from: dto.from,
            to: dto.to,
            ...(dto.steps ? { steps: dto.steps } : {}),
        });
    }

    @ApiOperation({
        summary: 'Состояние ночного конвейера за последние дни',
        description:
            'Журналы прогонов (снапшоты ai-analytics-etl-run, зерно ' +
            'portal-day) домена за окно days: шаги с длительностями, ' +
            'загруженными строками и вызовами Bitrix, отдельными списками ' +
            'штатно пропущенные и упавшие шаги, предупреждения санити-' +
            'панели, признак дрейфа входов и метрики прогона — те же ' +
            'четыре величины, что уходят в Prometheus. Сверху сводка окна: ' +
            'сколько прогонов ok / partial / failed. Только чтение: ' +
            'журнал пишет воркер kpi-report-sales.',
    })
    @ApiOkResponse({
        description: 'Сводка окна и прогоны, свежие первыми.',
        type: AiAnalyticsEtlStatusResultDto,
    })
    @Get('etl-status')
    async status(
        @Query() query: AiAnalyticsEtlStatusQueryDto,
    ): Promise<AiAnalyticsEtlStatusResultDto> {
        return this.etlStatus.status(
            query.domain,
            query.days ?? AI_ANALYTICS_ETL_STATUS_DEFAULTS.days,
        );
    }
}
