import { Injectable, Logger } from '@nestjs/common';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import { AI_ANALYTICS_BRIEF_JOB_OPTIONS } from '../../constants/ai-brief.const';
import { AI_ANALYTICS_JOB_RUNNING_STATES } from '../../constants/ai-overview.const';
import { buildBriefKey } from '../../brief/brief-cache-key.util';
import { EvidencePackBuilder } from '../../brief/evidence-pack.builder';
import {
    AiBriefCacheEntry,
    AiBriefDto,
    AiBriefJobData,
    AiBriefRequestDto,
} from '../../dto/ai-brief.dto';
import type { RequesterAccess } from '../access/perimeter.util';
import { RequesterAccessService } from '../access/requester-access.service';
import { normalizeManagerIds } from '../loaders/managers.loader';

/**
 * Конверт ручки резюме (план §5.2): ready — резюме из кэша;
 * queued/processing — джоба с jobId = requestKey поставлена или идёт;
 * error — процессор упал, конверт живёт 120 с.
 */
export type BriefLookup =
    | { status: 'ready'; requestKey: string; data: AiBriefDto }
    | { status: 'queued' | 'processing'; requestKey: string; jobId: string }
    | { status: 'error'; requestKey: string; message: string };

/**
 * Поиск AI-резюме по паттерну «кэш → очередь» (ai/rules/heavy-endpoint-queue.md).
 *
 * Ключ результата — `sales-ai-analytics:v1:{domain}:brief:{packHash}`: он
 * считается по ПАКЕТУ ФАКТОВ, а не по фильтрам, поэтому два одинаковых
 * по сути периода (факты не изменились) делят один расчёт и одно резюме.
 * Пакет собирается синхронно — он читает только кэш витрины и снапшоты,
 * в Bitrix не ходит.
 *
 * Периметр: список менеджеров запроса проверяется на видимость
 * (чужой — 403), пустой список означает периметр requester'а.
 */
@Injectable()
export class BriefUseCase {
    private readonly logger = new Logger(BriefUseCase.name);

    constructor(
        private readonly pack: EvidencePackBuilder,
        private readonly cache: AiAnalyticsCacheService,
        private readonly queue: QueueDispatcherService,
        private readonly access: RequesterAccessService,
    ) {}

    async lookup(
        dto: AiBriefRequestDto,
        access: RequesterAccess,
        now = new Date(),
    ): Promise<BriefLookup> {
        const managerIds = this.resolveManagerIds(dto, access);
        const pack = await this.pack.build({
            domain: dto.domain,
            from: dto.from,
            to: dto.to,
            managerIds,
            now,
        });
        const requestKey = buildBriefKey(dto.domain, pack.hash);
        const forceRefresh = dto.forceRefresh === true;

        if (!forceRefresh) {
            const cached = await this.readEntry(requestKey);
            if (cached) return cached;
        }
        if (await this.isRunning(requestKey)) {
            return { status: 'processing', requestKey, jobId: requestKey };
        }
        await this.dispatch({
            domain: dto.domain,
            from: dto.from,
            to: dto.to,
            managerIds,
            requestKey,
            packHash: pack.hash,
            ...(dto.socketId ? { socketId: dto.socketId } : {}),
            ...(dto.requesterUserId
                ? { requesterUserId: dto.requesterUserId }
                : {}),
        });

        return { status: 'queued', requestKey, jobId: requestKey };
    }

    /**
     * Ставит джобу резюме с jobId = requestKey (Bull молча игнорирует
     * повтор существующего id — второй прогон не плодится).
     */
    async dispatch(data: AiBriefJobData): Promise<string> {
        await this.queue.dispatch<AiBriefJobData>(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_AI_ANALYTICS_BRIEF,
            data,
            data.requestKey,
            AI_ANALYTICS_BRIEF_JOB_OPTIONS,
        );
        this.logger.log(`Резюме поставлено в очередь: ${data.requestKey}`);

        return data.requestKey;
    }

    /**
     * Менеджеры резюме: явный список проверяется на видимость (чужой —
     * 403 тем же правилом, что у остальных ручек), без списка берётся
     * периметр requester'а; у роли cup периметра нет
     * (visibleManagerIds = null) — пакет собирается по всему порталу.
     */
    private resolveManagerIds(
        dto: AiBriefRequestDto,
        access: RequesterAccess,
    ): number[] {
        const explicit = normalizeManagerIds(dto.managerIds ?? []);
        if (explicit.length) {
            for (const managerId of explicit) {
                this.access.assertVisible(access, String(managerId));
            }

            return explicit;
        }

        return normalizeManagerIds(access.visibleManagerIds ?? []);
    }

    /** Запись кэша → конверт; резюме общее на домен, периметр уже в пакете. */
    private async readEntry(requestKey: string): Promise<BriefLookup | null> {
        const entry = await this.cache.getJson<AiBriefCacheEntry>(requestKey);
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
