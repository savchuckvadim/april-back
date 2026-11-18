import { Module } from '@nestjs/common';
import { RedisModule } from '@lib/core/redis/redis.module';
import { QueueModule } from '@lib/queue';
import { AnalysisPreviewStore } from '@lib/call-lib/call-report/analysis-preview';
import { AnalysisPreviewController } from './controllers/analysis-preview.controller';
import { AnalysisPreviewService } from './services/analysis-preview.service';

/**
 * Проверка разбора на одном звонке без записи (`admin/call-analysis-preview`)
 * — только в apps/admin: ставит задание в очередь разборов и читает итог из
 * Redis. Сам разбор идёт в воркере event-sales, где расшифровки и конвейер
 * разбора (ai/rules/app-api-surface.md, heavy-endpoint-queue.md).
 */
@Module({
    imports: [QueueModule, RedisModule],
    controllers: [AnalysisPreviewController],
    providers: [AnalysisPreviewService, AnalysisPreviewStore],
})
export class AnalysisPreviewAdminModule {}
