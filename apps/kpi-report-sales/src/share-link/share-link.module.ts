import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { QueueModule } from 'src/modules/queue/queue.module';
import { DownloadModule } from '../download';
import { ShareLinkController } from './controllers/share-link.controller';
import { ShareLinkPublicController } from './controllers/share-link-public.controller';
import { ShareLinkService } from './services/share-link.service';
import { ShareLinkSnapshotService } from './services/share-link-snapshot.service';
import { ShareLinkRefreshCron } from './services/share-link-refresh.cron';
import { ShareLinkRefreshProcessor } from './queue/share-link.processor';

/**
 * Публичные ссылки на KPI-отчёт (тег Swagger «Share Link» / «Share Link Public»).
 *
 * Метаданные — таблица share_link (Prisma), снимки данных — центральный
 * кэш AppCache (Redis + app_cache, переживает перезагрузку Redis).
 * Обновляемые ссылки пересчитываются по крону через Bull-очередь
 * SALES_KPI_REPORT (ShareLinkRefreshCron → ShareLinkRefreshProcessor).
 *
 * AppCacheService приходит из глобального AppCacheModule (root-модуль),
 * ExcelReportService — из DownloadModule (он уже смонтирован в приложение,
 * повторный импорт контроллеры не дублирует). Use-case'ы отчёта создаются
 * per-вызов через `new` — см. CLAUDE.md про race condition c this.bitrix.
 */
@Module({
    imports: [PBXModule, QueueModule, DownloadModule],
    controllers: [ShareLinkController, ShareLinkPublicController],
    providers: [
        ShareLinkService,
        ShareLinkSnapshotService,
        ShareLinkRefreshCron,
        ShareLinkRefreshProcessor,
    ],
})
export class ShareLinkModule {}
