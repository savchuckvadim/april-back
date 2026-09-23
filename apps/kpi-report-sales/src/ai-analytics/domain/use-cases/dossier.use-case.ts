import { Injectable, Logger } from '@nestjs/common';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { toPortalDate } from '@lib/sales-ai-analytics';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import {
    AI_DOSSIER_JOB_OPTIONS,
    AI_DOSSIER_MONTHS,
    buildDossierKey,
    dossierMonthKeys,
} from '../../constants/ai-dossier.const';
import { AI_ANALYTICS_JOB_RUNNING_STATES } from '../../constants/ai-overview.const';
import {
    AiDossierCacheEntry,
    AiDossierDto,
    AiDossierJobData,
    AiDossierRequestDto,
} from '../../dto/ai-dossier.dto';
import type { RequesterAccess } from '../access/perimeter.util';
import { RequesterAccessService } from '../access/requester-access.service';
import { SettingsLoader } from '../loaders/settings.loader';

/**
 * Конверт ручки досье: ready — досье из кэша; queued/processing — джоба
 * с jobId = requestKey поставлена или идёт; error — процессор упал,
 * конверт живёт 120 с.
 */
export type DossierLookup =
    | { status: 'ready'; requestKey: string; data: AiDossierDto }
    | { status: 'queued' | 'processing'; requestKey: string; jobId: string }
    | { status: 'error'; requestKey: string; message: string };

/**
 * Поиск досье менеджера по паттерну «кэш → очередь»
 * (ai/rules/heavy-endpoint-queue.md): сам ничего не считает — только
 * строит ключ, читает кэш и ставит джобу.
 *
 * Ключ — `{prefix}:{domain}:dossier:{managerId}:{from}_{to}`: одно и то
 * же окно одного менеджера делит расчёт независимо от того, кто из
 * руководителей его открыл (право смотреть проверяется ДО ключа, в
 * контроллере и здесь).
 *
 * Периметр: менеджер досье обязан быть видим запросившему — иначе 403
 * тем же правилом, что у остальных ручек витрины.
 *
 * `@Injectable` без bitrix-состояния (CLAUDE.md про race condition):
 * домен приходит параметром запроса.
 */
@Injectable()
export class DossierUseCase {
    private readonly logger = new Logger(DossierUseCase.name);

    constructor(
        private readonly settings: SettingsLoader,
        private readonly cache: AiAnalyticsCacheService,
        private readonly queue: QueueDispatcherService,
        private readonly access: RequesterAccessService,
    ) {}

    async lookup(
        dto: AiDossierRequestDto,
        access: RequesterAccess,
        now = new Date(),
    ): Promise<DossierLookup> {
        const managerId = String(Number(dto.managerId));
        this.access.assertVisible(access, managerId);
        const { calendar } = await this.settings.load(dto.domain);
        const months = dossierMonthKeys(
            toPortalDate(now, calendar.timeZone),
            dto.months ?? AI_DOSSIER_MONTHS.default,
        );
        const requestKey = buildDossierKey(
            dto.domain,
            managerId,
            months[0],
            months[months.length - 1],
        );

        if (dto.forceRefresh !== true) {
            const cached = await this.readEntry(requestKey);
            if (cached) return cached;
        }
        if (await this.isRunning(requestKey)) {
            return { status: 'processing', requestKey, jobId: requestKey };
        }
        await this.dispatch({
            domain: dto.domain,
            managerId,
            months: [...months],
            requestKey,
            ...(dto.socketId ? { socketId: dto.socketId } : {}),
            ...(dto.requesterUserId
                ? { requesterUserId: dto.requesterUserId }
                : {}),
        });

        return { status: 'queued', requestKey, jobId: requestKey };
    }

    /**
     * Ставит джобу досье с jobId = requestKey (Bull молча игнорирует
     * повтор существующего id — второй прогон не плодится).
     */
    async dispatch(data: AiDossierJobData): Promise<string> {
        await this.queue.dispatch<AiDossierJobData>(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_AI_ANALYTICS_DOSSIER,
            data,
            data.requestKey,
            AI_DOSSIER_JOB_OPTIONS,
        );
        this.logger.log(`Досье поставлено в очередь: ${data.requestKey}`);

        return data.requestKey;
    }

    /** Запись кэша → конверт ручки. */
    private async readEntry(requestKey: string): Promise<DossierLookup | null> {
        const entry = await this.cache.getJson<AiDossierCacheEntry>(requestKey);
        if (!entry) return null;
        if (entry.status === 'error') {
            return { status: 'error', requestKey, message: entry.message };
        }

        return { status: 'ready', requestKey, data: entry.data };
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
