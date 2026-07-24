import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { QueueDispatcherService } from '@/modules/queue';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { ShareLinkService } from './share-link.service';

export interface ShareLinkRefreshJobData {
    token: string;
}

/**
 * Планировщик обновляемых публичных ссылок.
 *
 * Каждые 5 минут выбирает из БД ссылки с next_refresh_at <= now
 * (индекс share_link_is_refreshable_status_next_refresh_at_index) и
 * диспатчит Bull-джобы. Сам пересчёт — в ShareLinkRefreshProcessor,
 * чтобы тяжёлые Bitrix-батчи не жили в cron-тике.
 *
 * jobId = share-refresh-{token} + removeOnComplete: пока джоба в очереди
 * или работает, повторный тик крона её не задублирует.
 */
@Injectable()
export class ShareLinkRefreshCron {
    private readonly logger = new Logger(ShareLinkRefreshCron.name);

    constructor(
        private readonly shareLinks: ShareLinkService,
        private readonly dispatcher: QueueDispatcherService,
    ) {}

    @Cron('*/5 * * * *')
    async dispatchDue(): Promise<void> {
        const due = await this.shareLinks.findDue();
        if (due.length === 0) return;

        this.logger.log(`Ссылок к обновлению: ${due.length}`);
        for (const link of due) {
            await this.dispatcher.dispatch<ShareLinkRefreshJobData>(
                QueueNames.SALES_KPI_REPORT,
                JobNames.SHARE_LINK_REFRESH,
                { token: link.token } satisfies ShareLinkRefreshJobData,
                `share-refresh-${link.token}`,
                { removeOnComplete: true, removeOnFail: true },
            );
        }
    }
}
