import { Module } from '@nestjs/common';

import { KpiReportController } from './kpi-report.controller';
import { ExcelReportService } from './services/kpi-report/kpi-report.service';
import { ReportKpiUseCase } from './usecases/kpi-report.use-case';
import { CallingStatisticUseCase } from './usecases/kpi-calling-statistic.use-case';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { QueueModule } from 'src/modules/queue/queue.module';
import { SalesKpiReportQueueProcessor } from './queue/kpi-report.processor';
import { KpiReportDownloadController } from './kpi-report-download.controller';
@Module({
  imports: [

    PBXModule,
    QueueModule,
 
  ],
  controllers: [KpiReportController, KpiReportDownloadController],
  providers: [
    ExcelReportService,
    ReportKpiUseCase,
    CallingStatisticUseCase,

    SalesKpiReportQueueProcessor
  ],
  exports: [ReportKpiUseCase]
})
export class KpiReportModule { }
