import { Injectable, Logger } from '@nestjs/common';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { JobOptions } from 'bull';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import { buildOverviewKey, overviewUsersKey } from '../../cache/cache-key.util';
import {
    AI_ANALYTICS_JOB_RUNNING_STATES,
    AI_ANALYTICS_OVERVIEW_JOB_OPTIONS,
} from '../../constants/ai-overview.const';
import {
    AiOverviewFiltersDto,
    AiOverviewJobData,
} from '../../dto/ai-overview-request.dto';
import { AiOverviewCacheEntry, AiOverviewDto } from '../../dto/ai-overview.dto';
import { AiManagerScopeResolver } from '../access/ai-manager-scope.resolver';
import type { AiManagerScope } from '../access/ai-manager-scope.util';
import type { RequesterAccess } from '../access/perimeter.util';
import {
    type AiAnalyticsPortalSettings,
    SettingsLoader,
} from '../loaders/settings.loader';
import { buildEmptyOverviewDto } from '../presenter/overview-empty.presenter';
import { withOverviewScope } from '../presenter/overview-scope.presenter';
import { applyOverviewPerimeter } from '../presenter/overview.presenter';

/** Ключ обзора и периметр (фильтр ∩ список разбора), под который он построен. */
export interface OverviewKeyRef {
    requestKey: string;
    /** Сотрудники строк; пусто — периметр пуст, ключ с маркером none. */
    managerIds: number[];
    scope: AiManagerScope;
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

type OverviewKeyFilters = Pick<
    OverviewLookupFilters,
    'domain' | 'from' | 'to' | 'managerIds' | 'confirmedOnly'
>;

/**
 * Паттерн «кэш-синхронно + очередь при промахе» для обзора (план 6.4,
 * ai/rules/heavy-endpoint-queue.md): ключ из нормализованных фильтров
 * (периметр — фильтр отчёта либо ростер ∩ список разбора звонков,
 * AiManagerScopeResolver) → cache hit → ready с периметром requester'а и
 * meta.scope запроса; существующая джоба (jobId = ключ) → processing;
 * промах → dispatch SALES_AI_ANALYTICS_OVERVIEW в SALES_KPI_REPORT →
 * queued. Пустой периметр (в фильтре никого из разбора) — ready с пустым
 * обзором без джобы: пустой managerIds в джобе загрузчики прочитали бы
 * как «весь ростер». forceRefresh обходит чтение, идущую джобу не
 * дублирует. Общий для ручек overview, attention, by-type и прогрева.
 */
@Injectable()
export class OverviewLookupUseCase {
    private readonly logger = new Logger(OverviewLookupUseCase.name);

    constructor(
        private readonly settings: SettingsLoader,
        private readonly scopes: AiManagerScopeResolver,
        private readonly cache: AiAnalyticsCacheService,
        private readonly queue: QueueDispatcherService,
    ) {}

    /** Ключ результата = jobId: период, периметр строк, confirmedOnly. */
    async resolveKey(filters: OverviewKeyFilters): Promise<OverviewKeyRef> {
        const { ref } = await this.resolveScoped(filters);

        return ref;
    }

    async lookup(
        filters: OverviewLookupFilters,
        access: RequesterAccess,
    ): Promise<OverviewLookup> {
        const { ref, settings } = await this.resolveScoped(filters);
        const { requestKey, managerIds, scope } = ref;
        if (scope.empty) {
            return {
                status: 'ready',
                requestKey,
                data: this.emptyOverview(filters, settings, scope),
            };
        }
        const forceRefresh = filters.forceRefresh === true;

        if (!forceRefresh) {
            const cached = await this.readEntry(requestKey, access, scope);
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

    /** Настройки портала (список разбора, календарь) и ключ по периметру. */
    private async resolveScoped(
        filters: OverviewKeyFilters,
    ): Promise<{ ref: OverviewKeyRef; settings: AiAnalyticsPortalSettings }> {
        const settings = await this.settings.load(filters.domain);
        const scope = await this.scopes.resolveFor(
            filters.domain,
            filters.managerIds,
            settings.callReport,
        );
        const requestKey = buildOverviewKey(
            filters.domain,
            filters.from,
            filters.to,
            overviewUsersKey(scope.managerIds),
            filters.confirmedOnly === true,
        );

        return {
            settings,
            ref: { requestKey, managerIds: scope.managerIds, scope },
        };
    }

    /** Пустой обзор пустого периметра: без кэша и джобы, meta.scope — причина. */
    private emptyOverview(
        filters: OverviewKeyFilters,
        settings: AiAnalyticsPortalSettings,
        scope: AiManagerScope,
    ): AiOverviewDto {
        return withOverviewScope(
            buildEmptyOverviewDto(
                {
                    domain: filters.domain,
                    from: filters.from,
                    to: filters.to,
                    confirmedOnly: filters.confirmedOnly === true,
                    settings,
                    scope,
                },
                new Date(),
            ),
            scope,
        );
    }

    /** Запись кэша → конверт; ready — с периметром requester'а и meta.scope запроса. */
    private async readEntry(
        requestKey: string,
        access: RequesterAccess,
        scope: AiManagerScope,
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
            data: withOverviewScope(
                applyOverviewPerimeter(entry.data, access, true),
                scope,
            ),
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
