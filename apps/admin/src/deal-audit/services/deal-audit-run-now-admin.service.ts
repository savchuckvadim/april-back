import { BadRequestException, Injectable } from '@nestjs/common';
import { JobStatus } from 'bull';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import {
    DEAL_AUDIT_RUN_NOW_RETRY,
    DealAuditRunNowJobData,
    dealAuditRunNowJobId,
    JobNames,
    QueueDispatcherService,
    QueueNames,
} from '@lib/queue';
import { AdminPortalService } from '../../portal/services/portal.service';
import { DealAuditRunNowAdminResponseDto } from '../dto/deal-audit-run-now.dto';
import { buildDealAuditRunNowNotes } from '../lib/deal-audit-run-now-notes';

/** Состояния джоба, при которых прогон портала ещё впереди или идёт. */
const PENDING_STATES: ReadonlySet<JobStatus | 'stuck'> = new Set<
    JobStatus | 'stuck'
>(['waiting', 'delayed', 'active', 'paused']);

export const DEAL_AUDIT_RUN_NOW_MESSAGE = {
    queued: 'Прогон поставлен. Сводки придут сотрудникам через несколько минут, итог — в Telegram.',
    alreadyQueued:
        'По этому порталу прогон уже идёт или ждёт очереди — дождитесь итога в Telegram.',
} as const;

/**
 * Кнопка «Сформировать и отправить» аудита сделок: ставит прогон портала
 * в очередь event-sales (сам аудит живёт там — крон, лок, отчёт в
 * Telegram). Один джоб на портал: пока прошлый ждёт или идёт, новый не
 * ставится, иначе сотрудники получили бы сводку дважды.
 */
@Injectable()
export class DealAuditRunNowAdminService {
    constructor(
        private readonly portals: AdminPortalService,
        private readonly settings: PortalAppSettingsService,
        private readonly queue: QueueDispatcherService,
    ) {}

    async runNow(portalId: number): Promise<DealAuditRunNowAdminResponseDto> {
        const { domain } = await this.portals.findById(portalId);
        if (!domain) {
            throw new BadRequestException(`У портала ${portalId} нет домена`);
        }
        const settings = await this.settings.resolve(
            domain,
            EnumPortalAppCode.eventSales,
        );
        const notes = buildDealAuditRunNowNotes(settings);
        const jobId = dealAuditRunNowJobId(domain);

        if (await this.isPending(jobId)) {
            return {
                queued: false,
                domain,
                message: DEAL_AUDIT_RUN_NOW_MESSAGE.alreadyQueued,
                notes,
            };
        }

        const data: DealAuditRunNowJobData = { domain };
        await this.queue.dispatch(
            QueueNames.EVENT_SALES_DEAL_AUDIT_RUN,
            JobNames.EVENT_SALES_DEAL_AUDIT_RUN_NOW,
            data,
            jobId,
            {
                attempts: DEAL_AUDIT_RUN_NOW_RETRY.attempts,
                backoff: {
                    type: 'fixed',
                    delay: DEAL_AUDIT_RUN_NOW_RETRY.backoffMs,
                },
                removeOnComplete: true,
                removeOnFail: true,
            },
        );
        return {
            queued: true,
            domain,
            message: DEAL_AUDIT_RUN_NOW_MESSAGE.queued,
            notes,
        };
    }

    /**
     * Джоб портала ещё ждёт или идёт. Завершённый остаток (если Bull не
     * успел его убрать) снимается — иначе jobId занят и новый не встанет.
     */
    private async isPending(jobId: string): Promise<boolean> {
        const job = await this.queue.getJob(
            QueueNames.EVENT_SALES_DEAL_AUDIT_RUN,
            jobId,
        );
        if (!job) return false;
        if (PENDING_STATES.has(await job.getState())) return true;
        await job.remove().catch(() => undefined);
        return false;
    }
}
