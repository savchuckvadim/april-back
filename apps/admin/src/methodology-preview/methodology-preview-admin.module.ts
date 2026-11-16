import { Module } from '@nestjs/common';
import { RedisModule } from '@lib/core/redis/redis.module';
import { QueueModule } from '@lib/queue';
import { MethodologyPreviewStore } from '@lib/call-lib/call-report/methodology';
import { MethodologyPreviewController } from './controllers/methodology-preview.controller';
import { MethodologyPreviewService } from './services/methodology-preview.service';

/**
 * Проверка черновика методики на одном звонке (`admin/methodologies/preview`)
 * — только в apps/admin: ставит задание в очередь разборов и читает итог из
 * Redis. Сам проход методики идёт в воркере event-sales, где расшифровки и
 * конвейер разбора (ai/rules/app-api-surface.md, heavy-endpoint-queue.md).
 */
@Module({
    imports: [QueueModule, RedisModule],
    controllers: [MethodologyPreviewController],
    providers: [MethodologyPreviewService, MethodologyPreviewStore],
})
export class MethodologyPreviewAdminModule {}
