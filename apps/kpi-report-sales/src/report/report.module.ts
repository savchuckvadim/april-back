import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { QueueModule } from 'src/modules/queue/queue.module';
import { WsModule } from '@/core/ws/ws.module';
import { KpiReportController } from './controllers/kpi-report.controller';
import { SalesKpiReportQueueProcessor } from './queue/kpi-report.processor';

/**
 * KPI-отчёт отдела продаж (тег Swagger «Sales Report»): расчёт показателей
 * по сотрудникам и статистика звонков.
 *
 * Use-case'ы (ReportKpiUseCase, CallingStatisticUseCase) и ActionService
 * создаются per-domain через `new` внутри контроллера/процессора — см.
 * CLAUDE.md про race condition c this.bitrix. В providers — только Bull-процессор.
 */
@Module({
    imports: [PBXModule, QueueModule, WsModule],
    controllers: [KpiReportController],
    providers: [SalesKpiReportQueueProcessor],
})
export class ReportModule {}
