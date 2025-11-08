import { Module } from '@nestjs/common';

import { KpiReportController } from './kpi-report.controller';
import { ExcelReportService } from './services/kpi-report/kpi-report.service';
import { ReportKpiUseCase } from './usecases/kpi-report.use-case';
import { CallingStatisticUseCase } from './usecases/kpi-calling-statistic.use-case';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { QueueModule } from 'src/modules/queue/queue.module';
import { SalesKpiReportQueueProcessor } from './queue/kpi-report.processor';
import { KpiReportDownloadController } from './kpi-report-download.controller';
import { SalesUserReportController } from './user-report/controllers/sales-user-report.controller';
import { SalesUserReportService } from './user-report/services/sales-user-report.service';
import { SalesUserReportQueueProcessor } from './user-report/queue/sales-user-report.processor';
import { RedisModule } from '@/core/redis/redis.module';
@Module({
    imports: [
        PBXModule,
        QueueModule,
        RedisModule
    ],
    controllers: [
        KpiReportController,
        KpiReportDownloadController,
        SalesUserReportController,


    ],
    providers: [
        ExcelReportService,

        // CallingStatisticUseCase,

        SalesKpiReportQueueProcessor,


        SalesUserReportQueueProcessor,
        SalesUserReportService,
    ],
    // exports: [ReportKpiUseCase],
})
export class KpiReportModule {}
