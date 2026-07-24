import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { QueueModule } from 'src/modules/queue/queue.module';
import { RedisModule } from '@/core/redis/redis.module';
import { WsModule } from '@/core/ws/ws.module';
import { SalesUserReportController } from './controllers/sales-user-report.controller';
import { SalesUserReportService } from './services/sales-user-report.service';
import { SalesUserReportQueueProcessor } from './queue/sales-user-report.processor';

/**
 * Детальный отчёт по конкретному сотруднику (тег Swagger «Sales Report»,
 * ручка `sales-user-report`): асинхронная генерация через очередь
 * SALES_KPI_REPORT + отдача результата по WebSocket.
 *
 * SalesUserReportService помечен @Injectable, но bitrix-инстанс получает
 * per-request через PBXService (this.pbx) — без this.bitrix.
 */
@Module({
    imports: [PBXModule, QueueModule, RedisModule, WsModule],
    controllers: [SalesUserReportController],
    providers: [SalesUserReportService, SalesUserReportQueueProcessor],
})
export class UserReportModule {}
