import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { QueueModule } from 'src/modules/queue/queue.module';
import { WsModule } from '@/core/ws/ws.module';
import { SalesFinanceController } from './sales-finance.controller';
import { SalesFinanceCacheService } from './cache/sales-finance-cache.service';
import { SalesFinanceQueueProcessor } from './queue/sales-finance.processor';

/**
 * Финансовая аналитика отдела продаж.
 *
 * В providers только инфраструктура (@Injectable без bitrix-состояния):
 * кэш и процессор очереди. Доменные сервисы создаются per-request через
 * `new Svc(bitrix, portal)` внутри use-case'ов — см. CLAUDE.md про
 * race condition c this.bitrix.
 */
@Module({
    imports: [PBXModule, QueueModule, WsModule],
    controllers: [SalesFinanceController],
    providers: [SalesFinanceCacheService, SalesFinanceQueueProcessor],
})
export class SalesFinanceModule {}
