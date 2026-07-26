import { Process, Processor } from '@nestjs/bull';
import { Logger, NotFoundException } from '@nestjs/common';
import { Job } from 'bull';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { ShareLinkService } from '../services/share-link.service';
import { ShareLinkSnapshotService } from '../services/share-link-snapshot.service';
import { ShareLinkRefreshJobData } from '../services/share-link-refresh.cron';
import { EShareLinkStatus } from '../dto/share-link.dto';

/**
 * Воркер регенерации снимков публичных ссылок. Очередной процессор на
 * очереди SALES_KPI_REPORT (прецедент: SalesFinanceQueueProcessor).
 *
 * Ошибки: портал не найден (удалили приложение) — статус error, снимок
 * остаётся видимым до expiry; транзиентные (Bitrix недоступен) — просто
 * откладываем следующую попытку на интервал.
 */
@Processor(QueueNames.SALES_KPI_REPORT)
export class ShareLinkRefreshProcessor {
    private readonly logger = new Logger(ShareLinkRefreshProcessor.name);

    constructor(
        private readonly shareLinks: ShareLinkService,
        private readonly snapshots: ShareLinkSnapshotService,
    ) {}

    @Process(JobNames.SHARE_LINK_REFRESH)
    async handleRefresh(job: Job<ShareLinkRefreshJobData>): Promise<void> {
        const { token } = job.data;
        const link = await this.shareLinks.findByToken(token);

        // Обрабатываем и PENDING (первая генерация после создания), и
        // ACTIVE (плановое/ручное обновление). Отозвана/протухла/error — стоп.
        const processable =
            link &&
            (link.status === EShareLinkStatus.PENDING ||
                link.status === EShareLinkStatus.ACTIVE) &&
            link.expiresAt.getTime() > Date.now();
        if (!link || !processable) {
            this.logger.debug(`SHARE_LINK_REFRESH: ${token} не подлежит обработке`);
            return;
        }
        const isFirstSnapshot = link.status === EShareLinkStatus.PENDING;

        try {
            await this.snapshots.generate(
                link,
                this.shareLinks.parseSnapshot(link),
            );
            if (isFirstSnapshot) {
                await this.shareLinks.markGenerated(link);
                this.logger.log(`Снимок ${token} сгенерирован (PENDING → ACTIVE)`);
            } else {
                await this.shareLinks.markRefreshed(link);
                this.logger.log(`Снимок ${token} обновлён`);
            }
        } catch (error) {
            if (error instanceof NotFoundException) {
                this.logger.error(
                    `SHARE_LINK_REFRESH ${token}: портал недоступен — статус error`,
                );
                await this.shareLinks.markError(link);
                return;
            }
            const message =
                error instanceof Error ? error.message : String(error);
            this.logger.warn(
                `SHARE_LINK_REFRESH ${token}: ${message} — отложено на интервал`,
            );
            await this.shareLinks.postponeRefresh(link);
        }
    }
}
