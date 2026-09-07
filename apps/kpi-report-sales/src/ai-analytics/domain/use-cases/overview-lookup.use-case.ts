import { Injectable, Logger } from '@nestjs/common';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { JobOptions } from 'bull';
import { buildReportUsersKey } from '../../../report';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import { buildOverviewKey } from '../../cache/cache-key.util';
import {
    AI_ANALYTICS_JOB_RUNNING_STATES,
    AI_ANALYTICS_OVERVIEW_JOB_OPTIONS,
} from '../../constants/ai-overview.const';
import {
    AiOverviewFiltersDto,
    AiOverviewJobData,
} from '../../dto/ai-overview-request.dto';
import { AiOverviewCacheEntry, AiOverviewDto } from '../../dto/ai-overview.dto';
import type { RequesterAccess } from '../access/perimeter.util';
import { ManagersLoader } from '../loaders/managers.loader';
import { applyOverviewPerimeter } from '../presenter/overview.presenter';

/** Ключ обзора и нормализованный ростер, под который он построен. */
export interface OverviewKeyRef {
    requestKey: string;
    managerIds: number[];
}

/**
 * Итог поиска обзора (конверт плана 6.2): ready — данные уже в периметре
 * requester'а; queued/processing — джоба с jobId = requestKey поставлена
 * или идёт; error — процессор упал, конверт живёт 120 с.
 */
export type OverviewLookup =
    | { status: 'ready'; requestKey: string; data: AiOverviewDto }
    | { status: 'queued' | 'processing'; requestKey: string; jobId: string }
    | { status: 'error'; requestKey: string; message: string };

/** Что нужно, чтобы построить ключ и payload джобы обзора. */
export type OverviewLookupFilters = Pick<
    AiOverviewFiltersDto,
    | 'domain'
    | 'from'
    | 'to'
    | 'managerIds'
    | 'confirmedOnly'
    | 'socketId'
    | 'forceRefresh'
    | 'requesterUserId'
>;

/**
 * Паттерн «кэш-синхронно + очередь при промахе» для обзора (план 6.4,
 * ai/rules/heavy-endpoint-queue.md): ключ из нормализованных фильтров
 * (ростер — явный список либо структура) → cache hit → ready с периметром;
 * существующая джоба (jobId = ключ) → processing; промах → dispatch
 * SALES_AI_ANALYTICS_OVERVIEW в SALES_KPI_REPORT → queued. forceRefresh
 * обходит чтение, идущую джобу не дублирует. Общий для ручек overview,
 * attention, by-type и прогрева.
 */
@Injectable()
export class OverviewLookupUseCase {
    private readonly logger = new Logger(OverviewLookupUseCase.name);

    constructor(
        private readonly managers: ManagersLoader,
        private readonly cache: AiAnalyticsCacheService,
        private readonly queue: QueueDispatcherService,
    ) {}

    /** Ключ результата = jobId: период, нормализованный ростер, confirmedOnly. */
    async resolveKey(
        filters: Pick<
            OverviewLookupFilters,
            'domain' | 'from' | 'to' | 'managerIds' | 'confirmedOnly'
        >,
    ): Promise<OverviewKeyRef> {
        const managerIds = await this.managers.resolve(
            filters.domain,
            filters.managerIds,
        );
        return {
            managerIds,
            requestKey: buildOverviewKey(
                filters.domain,
                filters.from,
                filters.to,
                buildReportUsersKey(managerIds),
                filters.confirmedOnly === true,
            ),
        };
    }

    async lookup(
        filters: OverviewLookupFilters,
        access: RequesterAccess,
    ): Promise<OverviewLookup> {
        const { requestKey, managerIds } = await this.resolveKey(filters);
        const forceRefresh = filters.forceRefresh === true;

        if (!forceRefresh) {
            const cached = await this.readEntry(requestKey, access);
            if (cached) return cached;
        }
        if (await this.isRunning(requestKey)) {
            return { status: 'processing', requestKey, jobId: requestKey };
        }
        await this.dispatch({
            domain: filters.domain,
            from: filters.from,
            to: filters.to,
            managerIds,
            confirmedOnly: filters.confirmedOnly === true,
            forceRefresh,
            requestKey,
            ...(filters.socketId ? { socketId: filters.socketId } : {}),
            ...(filters.requesterUserId
                ? { requesterUserId: filters.requesterUserId }
                : {}),
        });
        return { status: 'queued', requestKey, jobId: requestKey };
    }

    /**
     * Ставит джобу обзора с jobId = requestKey (Bull молча игнорирует
     * повтор существующего id — второй прогон не плодится).
     */
    async dispatch(
        data: AiOverviewJobData,
        options: Omit<JobOptions, 'jobId'> = AI_ANALYTICS_OVERVIEW_JOB_OPTIONS,
    ): Promise<string> {
        await this.queue.dispatch<AiOverviewJobData>(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_AI_ANALYTICS_OVERVIEW,
            data,
            data.requestKey,
            options,
        );
        this.logger.log(
            `Обзор поставлен в очередь: ${data.requestKey}` +
                (data.forceRefresh ? ' (forceRefresh)' : ''),
        );
        return data.requestKey;
    }

    /** Запись кэша → конверт; ready — с периметром requester'а. */
    private async readEntry(
        requestKey: string,
        access: RequesterAccess,
    ): Promise<OverviewLookup | null> {
        const entry =
            await this.cache.getJson<AiOverviewCacheEntry>(requestKey);
        if (!entry) return null;
        if (entry.status === 'error') {
            return { status: 'error', requestKey, message: entry.message };
        }
        return {
            status: 'ready',
            requestKey,
            data: applyOverviewPerimeter(entry.data, access, true),
        };
    }

    /** Джоба с таким id ещё ждёт/идёт — повторный запрос подписывается на неё. */
    private async isRunning(jobId: string): Promise<boolean> {
        const job = await this.queue.getJob(QueueNames.SALES_KPI_REPORT, jobId);
        if (!job) return false;
        const state = await job.getState();
        return (AI_ANALYTICS_JOB_RUNNING_STATES as readonly string[]).includes(
            state,
        );
    }
}
