import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { QueueModule } from 'src/modules/queue/queue.module';
import { WsModule } from '@/core/ws/ws.module';
import { ReportModule } from '../report';
import { KpiDigestController } from './controllers/digest.controller';
import { KpiDigestQueueProcessor } from './queue/digest.processor';
import { DigestPartitionCacheService } from './cache/digest-partition-cache.service';

/**
 * Дневной дайджест ОП (тег Swagger «Sales Report», ручки
 * kpi-report/digest/get и kpi-report/digest/cache/reset).
 *
 * Режим — только очередь: конверт результата в AppCache через
 * ReportResultCacheService (из ReportModule), партиции дня — свой
 * DigestPartitionCacheService, compute — в KpiDigestQueueProcessor.
 * DigestUseCase создаётся per-domain через `new` (правило CLAUDE.md про
 * race condition c this.bitrix); в providers — только @Injectable без
 * bitrix-состояния.
 */
@Module({
    imports: [PBXModule, QueueModule, WsModule, ReportModule],
    controllers: [KpiDigestController],
    providers: [KpiDigestQueueProcessor, DigestPartitionCacheService],
})
export class DigestModule {}
