import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import {
    latestClosedOwnerReportPeriod,
    ownerReportPeriodBounds,
    toPortalDate,
    type OwnerReportPeriodBounds,
} from '@lib/sales-ai-analytics';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import { AI_ANALYTICS_JOB_RUNNING_STATES } from '../../constants/ai-overview.const';
import type {
    AiOwnerReportDto,
    AiOwnerReportRequestDto,
} from '../../dto/ai-owner-report.dto';
import { OwnerReportSnapshotReader } from '../../owner-report/owner-report-snapshot.reader';
import { buildOwnerReportKey } from '../../owner-report/owner-report.cache-key.util';
import {
    AI_OWNER_REPORT_ERRORS,
    AI_OWNER_REPORT_JOB_OPTIONS,
    AI_OWNER_REPORT_TTL_SECONDS,
} from '../../owner-report/owner-report.const';
import type {
    AiOwnerReportCacheEntry,
    AiOwnerReportJobData,
} from '../../owner-report/owner-report.types';
import { SettingsLoader } from '../loaders/settings.loader';

export type OwnerReportLookup =
    | { status: 'ready'; requestKey: string; data: AiOwnerReportDto }
    | { status: 'queued' | 'processing'; requestKey: string; jobId: string }
    | { status: 'error'; requestKey: string; message: string };

/**
 * Ручка отчёта собственнику (паттерн очередь + WS + кэш): период по виду и
 * ключу (пусто — последний закрытый), кэш → снапшот → идущая джоба →
 * постановка в очередь. Права (cup|op) проверяет контроллер.
 */
@Injectable()
export class OwnerReportUseCase {
    private readonly logger = new Logger(OwnerReportUseCase.name);

    constructor(
        private readonly settings: SettingsLoader,
        private readonly cache: AiAnalyticsCacheService,
        private readonly queue: QueueDispatcherService,
        private readonly reader: OwnerReportSnapshotReader,
    ) {}

    async lookup(
        dto: AiOwnerReportRequestDto,
        now = new Date(),
    ): Promise<OwnerReportLookup> {
        const bounds = await this.resolveBounds(dto, now);
        const requestKey = buildOwnerReportKey(
            dto.domain,
            dto.kind,
            bounds.periodKey,
        );
        const forceRefresh = dto.forceRefresh === true;
        if (!forceRefresh) {
            const cached = await this.readEntry(requestKey);
            if (cached) return cached;
            const stored = await this.reader.read(
                dto.domain,
                dto.kind,
                bounds.periodKey,
            );
            if (stored) {
                await this.store(requestKey, { status: 'ready', data: stored });
                return { status: 'ready', requestKey, data: stored };
            }
        }
        if (await this.isRunning(requestKey)) {
            return { status: 'processing', requestKey, jobId: requestKey };
        }
        await this.dispatch({
            domain: dto.domain,
            kind: dto.kind,
            periodKey: bounds.periodKey,
            from: bounds.from,
            to: bounds.to,
            requestKey,
            ...(forceRefresh ? { forceRefresh } : {}),
            ...(dto.socketId ? { socketId: dto.socketId } : {}),
            ...(dto.requesterUserId
                ? { requesterUserId: dto.requesterUserId }
                : {}),
        });
        return { status: 'queued', requestKey, jobId: requestKey };
    }

    /** Границы периода: ключ из запроса или последний закрытый; открытый период — 400. */
    async resolveBounds(
        dto: Pick<AiOwnerReportRequestDto, 'domain' | 'kind' | 'periodKey'>,
        now: Date,
    ): Promise<OwnerReportPeriodBounds> {
        const { calendar } = await this.settings.load(dto.domain);
        const today = toPortalDate(now, calendar.timeZone);
        if (!dto.periodKey)
            return latestClosedOwnerReportPeriod(dto.kind, today);
        const bounds = ownerReportPeriodBounds(dto.kind, dto.periodKey);
        if (!bounds)
            throw new BadRequestException(AI_OWNER_REPORT_ERRORS.periodKey);
        if (bounds.to >= today) {
            throw new BadRequestException(AI_OWNER_REPORT_ERRORS.periodOpen);
        }
        return bounds;
    }

    async dispatch(data: AiOwnerReportJobData): Promise<string> {
        await this.queue.dispatch<AiOwnerReportJobData>(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_AI_ANALYTICS_OWNER_REPORT,
            data,
            data.requestKey,
            AI_OWNER_REPORT_JOB_OPTIONS,
        );
        this.logger.log(
            `Отчёт собственнику поставлен в очередь: ${data.requestKey}`,
        );
        return data.requestKey;
    }

    private async readEntry(
        requestKey: string,
    ): Promise<OwnerReportLookup | null> {
        const entry =
            await this.cache.getJson<AiOwnerReportCacheEntry>(requestKey);
        if (!entry) return null;
        if (entry.status === 'error') {
            return { status: 'error', requestKey, message: entry.message };
        }
        return { status: 'ready', requestKey, data: entry.data };
    }

    private async store(
        key: string,
        entry: AiOwnerReportCacheEntry,
    ): Promise<void> {
        try {
            await this.cache.setJson(
                key,
                entry,
                AI_OWNER_REPORT_TTL_SECONDS.ready,
            );
        } catch (error) {
            this.logger.warn(
                `Кэш ${key} не записан: ${(error as Error).message}`,
            );
        }
    }

    private async isRunning(jobId: string): Promise<boolean> {
        const job = await this.queue.getJob(QueueNames.SALES_KPI_REPORT, jobId);
        if (!job) return false;
        const state = await job.getState();
        return (AI_ANALYTICS_JOB_RUNNING_STATES as readonly string[]).includes(
            state,
        );
    }
}
