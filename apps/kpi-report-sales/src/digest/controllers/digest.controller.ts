import {
    BadRequestException,
    Body,
    Controller,
    HttpCode,
    Post,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import type { IsoDate } from '../../shared/lib/month-segments.util';
import { buildReportUsersKey, ReportResultCacheService } from '../../report';
import { DigestPartitionCacheService } from '../cache/digest-partition-cache.service';
import {
    buildDigestJobId,
    buildDigestRequestKey,
    buildDigestResultKey,
} from '../cache/digest-cache-key.util';
import {
    KPI_DIGEST_CACHE_APP,
    KPI_DIGEST_JOB_ATTEMPTS,
    KPI_DIGEST_JOB_BACKOFF_DELAY_MS,
    KPI_DIGEST_WS_EVENTS,
} from '../constants/digest.const';
import {
    KpiDigestCacheResetRequestDto,
    KpiDigestCacheResetResponseDto,
    KpiDigestRequestDto,
} from '../dto/digest-request.dto';
import {
    KpiDigestReportDto,
    KpiDigestResponseDto,
} from '../dto/digest-response.dto';
import type { KpiDigestJob } from '../dto/digest.job.dto';
import { assertIsoDate, DigestDateError } from '../lib/digest-period.util';

/**
 * Дневной дайджест ОП — только режим очереди («кэш-синхронно + очередь при
 * промахе», ai/rules/heavy-endpoint-queue.md): контроллер читает конверт из
 * кэша и ставит Bull-job; compute только в KpiDigestQueueProcessor.
 */
@ApiTags('Sales Report')
@Controller('kpi-report/digest')
export class KpiDigestController {
    constructor(
        private readonly queue: QueueDispatcherService,
        private readonly resultCache: ReportResultCacheService,
        private readonly partitionCache: DigestPartitionCacheService,
    ) {}

    @Post('get')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Дневной дайджест отдела продаж',
        description:
            'Срез дня по сотрудникам из событий списка sales_kpi: что было ' +
            'запланировано на начало дня, что проведено результативно / не ' +
            'состоялось / перенесено / просрочено (с разбивкой по типам, ' +
            'звонки по подтипам), что запланировано на будущее, продажи и ' +
            'отказы, документы, фактические звонки и эфир по часам, записи с ' +
            'комментариями, сводка по всему порталу. Мгновенный ответ ' +
            '{status: ready|queued|error}; готовый дайджест приходит ' +
            `WS-событием ${KPI_DIGEST_WS_EVENTS.DONE} на socketId либо ` +
            'поллингом (повторный POST до status ready). Партиции дня ' +
            'кэшируются: закрытый день — 30 дней, сегодня — 120 с.',
    })
    @ApiBody({ type: KpiDigestRequestDto })
    @ApiOkResponse({
        type: KpiDigestResponseDto,
        description: 'Конверт {status, data?, requestKey, message?}.',
    })
    async getDigest(
        @Body() dto: KpiDigestRequestDto,
    ): Promise<KpiDigestResponseDto> {
        const date = this.dateOr400(dto.filters.date);
        const usersKey = buildReportUsersKey(
            dto.filters.departament.map(user => user.ID),
        );
        const resultKey = buildDigestResultKey(date, usersKey);
        const requestKey = buildDigestRequestKey(date, usersKey);

        if (dto.forceRefresh !== true) {
            const envelope =
                await this.resultCache.getEnvelope<KpiDigestReportDto>(
                    KPI_DIGEST_CACHE_APP,
                    dto.domain,
                    resultKey,
                );
            if (envelope?.status === 'ready') {
                return { status: 'ready', data: envelope.data, requestKey };
            }
            if (envelope?.status === 'error') {
                return {
                    status: 'error',
                    message: envelope.message,
                    requestKey,
                };
            }
        }

        const jobData: KpiDigestJob = {
            domain: dto.domain,
            filters: { ...dto.filters, date },
            socketId: dto.socketId,
            requestKey,
            resultKey,
            forceRefresh: dto.forceRefresh,
        };
        await this.queue.dispatch(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_DIGEST_GENERATE,
            jobData,
            buildDigestJobId(dto.domain, date, usersKey),
            {
                attempts: KPI_DIGEST_JOB_ATTEMPTS,
                backoff: {
                    type: 'fixed' as const,
                    delay: KPI_DIGEST_JOB_BACKOFF_DELAY_MS,
                },
                removeOnComplete: true,
                removeOnFail: true,
            },
        );
        return { status: 'queued', requestKey };
    }

    @Post('cache/reset')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сброс кэша дневного дайджеста',
        description:
            'Удаляет партиции дайджеста домена (события, план на день, ' +
            'звонки, конверты результатов): все дни либо только указанный день.',
    })
    @ApiBody({ type: KpiDigestCacheResetRequestDto })
    @ApiOkResponse({ type: KpiDigestCacheResetResponseDto })
    async resetCache(
        @Body() dto: KpiDigestCacheResetRequestDto,
    ): Promise<KpiDigestCacheResetResponseDto> {
        const date = dto.date ? this.dateOr400(dto.date) : undefined;
        return this.partitionCache.reset(dto.domain, date);
    }

    private dateOr400(value: string): IsoDate {
        try {
            return assertIsoDate(value);
        } catch (error) {
            if (error instanceof DigestDateError) {
                throw new BadRequestException(error.message);
            }
            throw error;
        }
    }
}
